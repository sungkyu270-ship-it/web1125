"use strict";

const get = (id) => document.getElementById(id);
const form = get("trip-form");
const won = new Intl.NumberFormat("ko-KR");
const dailyRate = 25_000;
const nightCaps = { seoul: 100_000, metro: 80_000, other: 70_000 };
const millisecondsPerDay = 86_400_000;
let currentResult = null;

function show(id, visible) {
  const section = get(id);
  section.hidden = !visible;
  for (const input of section.querySelectorAll("input, select, button")) {
    input.disabled = !visible;
  }
}

function tripDays() {
  const start = get("start").valueAsNumber;
  const end = get("end").valueAsNumber;
  return (end - start) / millisecondsPerDay + 1;
}

function isInside() {
  return form.elements["trip-type"].value === "inside";
}

function value(id) {
  return Number(get(id).value);
}

function syncTransport(row) {
  const mode = row.querySelector(".transport-mode").value;
  const fareField = row.querySelector(".fare-field");
  const gradeOne = ["1", "actual"].includes(get("grade").value);
  const labels = {
    rail: gradeOne ? "특실 등 지급 대상 금액 (원)" : "일반실 등 지급 대상 금액 (원)",
    ship: gradeOne ? "1등급 지급 대상 금액 (원)" : "2등급 지급 대상 금액 (원)",
    car: "철도 또는 버스 기준 운임 (원)",
    "necessary-car": "지급 대상 연료비·통행료 등 (원)",
  };
  fareField.hidden = mode === "public";
  fareField.querySelector("input").disabled = fareField.hidden || isInside();
  row.querySelector(".fare-label").textContent = labels[mode] || "지급 대상 금액 (원)";
}

function syncForm() {
  const inside = isInside();
  const multipleDays = tripDays() > 1;
  const actual = get("grade").value === "actual";
  show("inside", inside);
  show("outside", !inside);
  show("expense-card", !inside);
  show("same-day-hours", inside && !multipleDays);
  show("multiple-day-hours", inside && multipleDays);
  const mixed = inside && get("inside-vehicle").value === "mixed";
  if (!multipleDays && mixed) get("inside-vehicle").value = "public";
  get("inside-vehicle").querySelector('[value="mixed"]').disabled = !multipleDays;
  show("reduced-inside-field", multipleDays && mixed);
  show("meal-days-field", !inside && !actual && get("limited-meals").checked);
  show("overlap-field", !inside && !actual && get("continuous").checked && tripDays() > 16 && value("half-days") > 0);
  show("actual-field", !inside && actual);
  show("mileage-section", !inside && !actual);
  show("mileage-field", !inside && !actual && get("mileage").checked);
  for (const id of ["half-days", "limited-meals", "continuous"]) {
    get(id).disabled = inside || actual;
    get(id).closest("label").hidden = actual;
  }
  get("half-hint").hidden = actual;
  for (const row of get("transport-rows").children) syncTransport(row);
  for (const row of get("stay-rows").children) {
    const applies = get("grade").value === "2";
    row.querySelector(".over-cap").hidden = !applies;
    row.querySelector(".allow-extra").disabled = !applies || inside;
  }
  const grade = get("grade").value;
  get("fare-rule").textContent = grade
    ? grade === "2" ? "제2호 기준은 철도 일반실과 선박 2등급입니다." : "제1호 기준은 철도 특실과 선박 1등급입니다."
    : "";
}

function addRow(kind) {
  const row = get(kind + "-template").content.firstElementChild.cloneNode(true);
  get(kind + "-rows").append(row);
  row.querySelector(".remove").addEventListener("click", () => {
    row.remove();
    clearResult();
    get("add-" + kind).focus();
  });
  syncForm();
  clearResult();
  row.querySelector("select").focus();
}

function validate(condition, message, id) {
  if (!condition) {
    const error = new Error(message);
    error.field = id;
    throw error;
  }
}

function calculateInside(days) {
  const valueForDay = get("hours").value;
  const long = days === 1 ? Number(valueForDay === "long") : value("long-days");
  const short = days === 1 ? Number(valueForDay === "short") : value("short-days");
  const count = long + short;
  const vehicle = get("inside-vehicle").value;
  validate(count >= 1 && count <= days, "실제 출장 일수의 합계는 1일 이상이어야 하며 입력한 기간을 넘을 수 없습니다.", "long-days");
  const reduced = vehicle === "public" ? count : vehicle === "mixed" ? value("reduced-inside") : 0;
  validate(vehicle !== "mixed" || (reduced >= 1 && reduced < count), "일부 출장일 감액을 선택했다면 감액 일수를 실제 출장 일수보다 적게 입력하세요.", "reduced-inside");
  const pay = vehicle === "assigned" ? 0 : long * 20_000 + short * 10_000 - reduced * 10_000;
  const note = vehicle === "assigned"
    ? "전용 차량 배정자 미지급 기준을 적용했습니다."
    : reduced ? "감액 조건에 해당한 " + reduced + "일에 각각 10,000원을 감액했습니다." : "";
  return { context: "근무지 내 국내 출장 · " + count + "일", items: [["근무지 내 출장여비", pay]], note };
}

function dailyAllowance(days, halfDays) {
  if (!get("continuous").checked || days <= 16) {
    return dailyRate * (days - halfDays / 2);
  }
  const bands = [
    { days: 16, rate: 1 },
    { days: Math.min(days - 16, 15), rate: 0.9, id: "half-late" },
    { days: Math.min(Math.max(days - 31, 0), 30), rate: 0.8, id: "half-middle" },
    { days: Math.max(days - 61, 0), rate: 0.7, id: "half-final" },
  ];
  let remaining = halfDays;
  for (const band of bands.slice(1)) {
    band.halfDays = halfDays ? value(band.id) : 0;
    validate(band.halfDays <= band.days, "해당 구간의 감액 대상 일수가 구간의 여행일수를 넘습니다.", band.id);
    remaining -= band.halfDays;
  }
  validate(remaining >= 0 && remaining <= bands[0].days,
    "구간별 감액 일수와 전체 감액 일수를 확인하세요. 처음 16일에 해당하는 감액 일수는 최대 16일입니다.", "half-days");
  bands[0].halfDays = remaining;
  return bands.reduce((total, band) => total + (band.days - band.halfDays / 2) * Math.round(dailyRate * band.rate), 0);
}

function calculateOutside(days) {
  const grade = get("grade").value;
  const actual = grade === "actual";
  const halfDays = actual ? 0 : value("half-days");
  const mealDays = !actual && get("limited-meals").checked ? value("meal-days") : days;
  validate(halfDays <= days, "일비 감액 대상 일수는 여행일수를 넘을 수 없습니다.", "half-days");
  validate(mealDays <= days, "식비 지급 대상 일수는 여행일수를 넘을 수 없습니다.", "meal-days");

  let fare = 0;
  for (const row of get("transport-rows").children) {
    if (row.querySelector(".transport-mode").value !== "public") fare += Number(row.querySelector(".fare").value);
  }

  let nights = 0;
  let lodging = 0;
  let lodgingExtra = 0;
  for (const row of get("stay-rows").children) {
    const count = Number(row.querySelector(".nights").value);
    const rate = Number(row.querySelector(".nightly-price").value);
    const cap = grade === "2" ? nightCaps[row.querySelector(".region").value] : rate;
    nights += count;
    lodging += count * Math.min(rate, cap);
    if (row.querySelector(".allow-extra").checked && rate > cap) {
      lodgingExtra += count * Math.min(rate - cap, cap * 0.3);
    }
  }
  validate(nights < days, "숙박 박수의 합계는 출장일과 복귀일 사이의 밤 수를 넘을 수 없습니다.", "add-stay");

  const daily = actual ? value("actual-daily") : dailyAllowance(days, halfDays);
  const meals = actual ? value("actual-meals") : mealDays * dailyRate;
  const items = [["운임", fare], ["일비", daily], ["숙박비", lodging], ["식비", meals]];
  const notes = [];
  if (lodgingExtra) {
    items.push(["숙박비 상한 초과분 추가 지급", lodgingExtra]);
    notes.push("숙박비 추가 지급 정산은 출장 종료 다음 날부터 1주일 이내에 신청합니다.");
  }
  if (!actual && get("mileage").checked) {
    const eligibleDays = value("mileage-days");
    validate(eligibleDays <= days, "마일리지 추가 지급 대상 일수는 여행일수를 넘을 수 없습니다.", "mileage-days");
    items.push(["공적 항공마일리지 추가 일비", Math.min(value("mileage-saving"), eligibleDays * dailyRate / 2)]);
    notes.push("마일리지 추가 일비는 절약액 한도로 추정했습니다.");
  }
  if (!actual && get("continuous").checked && days > 16) {
    notes.push("동일 지역 장기체재 구간의 일비 감액을 반영했습니다.");
    if (halfDays && ["half-late", "half-middle", "half-final"].some((id) => value(id) > 0)) {
      notes.push("두 감액 조건이 겹친 날은 장기체재 감액 후 일비의 절반으로 추정했습니다. 적용 방식은 소속 기관에 확인하세요.");
    }
  }
  return { context: "근무지 외 국내 출장 · " + days + "일 · " + nights + "박 입력", items, note: notes.join(" ") };
}

function clearResult() {
  currentResult = null;
  get("form-error").hidden = true;
  get("breakdown").hidden = true;
  get("result-dates").hidden = true;
  get("result-note").hidden = true;
  get("result-actions").hidden = true;
  get("export-error").hidden = true;
  if (get("total").textContent !== "—") {
    get("total").textContent = "—";
    get("result-context").textContent = "입력이 변경되었습니다. 여비 계산을 다시 누르세요.";
  }
}

function display(result) {
  const breakdown = get("breakdown");
  breakdown.replaceChildren();
  let total = 0;
  for (const [name, amount] of result.items) {
    const term = document.createElement("dt");
    const definition = document.createElement("dd");
    term.textContent = name;
    definition.textContent = won.format(amount) + "원";
    breakdown.append(term, definition);
    total += amount;
  }
  const summary = get("total");
  summary.textContent = won.format(total) + "원";
  get("result-context").textContent = result.context;
  const dates = get("result-dates");
  currentResult = { ...result, total, start: get("start").value, end: get("end").value };
  dates.textContent = "출장 기간 " + currentResult.start + " ~ " + currentResult.end;
  dates.hidden = false;
  breakdown.hidden = false;
  const note = get("result-note");
  note.textContent = result.note;
  note.hidden = !result.note;
  get("result-actions").hidden = false;
  const title = get("result-title");
  const bounds = summary.getBoundingClientRect();
  if (title.getBoundingClientRect().top < 0 || bounds.bottom > window.innerHeight) {
    title.scrollIntoView({ block: "center" });
  }
}

for (const id of ["reduced-inside", "meal-days", "mileage-saving", "mileage-days"]) get(id).required = true;
get("add-transport").addEventListener("click", () => addRow("transport"));
get("add-stay").addEventListener("click", () => addRow("stay"));
get("open-reference").addEventListener("click", () => get("reference-dialog").showModal());
get("print-result").addEventListener("click", () => window.print());
get("export-result").addEventListener("click", async (event) => {
  const result = currentResult;
  if (!result) return;
  const button = event.currentTarget;
  const errorMessage = get("export-error");
  button.disabled = true;
  errorMessage.hidden = true;
  try {
    await downloadTravelWorkbook(result);
  } catch (error) {
    console.error(error);
    if (currentResult === result) {
      errorMessage.textContent = "엑셀 파일을 저장하지 못했습니다. 다시 시도하세요.";
      errorMessage.hidden = false;
    }
  } finally {
    button.disabled = false;
  }
});
form.addEventListener("input", () => {
  syncForm();
  clearResult();
});
form.addEventListener("reset", () => {
  get("transport-rows").replaceChildren();
  get("stay-rows").replaceChildren();
  clearResult();
  get("result-context").textContent = "출장 정보를 입력하고 여비 계산을 누르세요.";
  queueMicrotask(syncForm);
});
form.addEventListener("submit", (event) => {
  event.preventDefault();
  clearResult();
  try {
    const days = tripDays();
    validate(Number.isInteger(days) && days >= 1, "복귀일은 출장일과 같거나 그 이후여야 합니다.", "end");
    display(isInside() ? calculateInside(days) : calculateOutside(days));
  } catch (error) {
    if (!error.field) throw error;
    const message = get("form-error");
    message.textContent = error.message;
    message.hidden = false;
    get(error.field).focus();
  }
});
syncForm();
