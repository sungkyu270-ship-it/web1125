"use strict";

const sheetNamespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const officeRelationships = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const packageRelationships = "http://schemas.openxmlformats.org/package/2006/relationships";
const workbookMimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const xmlHeader = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const xmlEntities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };

function worksheetCell(reference, value, style) {
  if (typeof value === "number") {
    return `<c r="${reference}" s="${style}"><v>${value}</v></c>`;
  }
  const escaped = value.replace(/[&<>"']/g, (character) => xmlEntities[character]);
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escaped}</t></is></c>`;
}

function travelWorksheet(result) {
  const rows = [
    { values: ["국내 출장여비 계산 결과"], styles: [1] },
    { values: ["출장일", result.start] },
    { values: ["복귀일", result.end] },
    { values: ["출장 구분", result.context] },
    { values: [] },
    { values: ["지급 항목", "금액 (원)"], styles: [1, 1] },
    ...result.items.map((item) => ({ values: item, styles: [0, 2] })),
    { values: ["예상 지급액 합계", result.total], styles: [1, 3] },
  ];
  const merged = ["A1:B1"];
  if (result.note) {
    rows.push({ values: ["계산 참고 · " + result.note], styles: [4], height: Math.ceil((result.note.length + 8) / 32) * 18 });
    merged.push(`A${rows.length}:B${rows.length}`);
  }

  const sheetData = rows.map(({ values, styles = [], height }, index) => {
    const number = index + 1;
    const rowHeight = height ? ` ht="${height}" customHeight="1"` : "";
    const cells = values.map((value, column) => worksheetCell("AB"[column] + number, value, styles[column] ?? 0));
    return `<row r="${number}"${rowHeight}>${cells.join("")}</row>`;
  });
  return `<worksheet xmlns="${sheetNamespace}">
    <cols><col min="1" max="1" width="33" customWidth="1"/><col min="2" max="2" width="43" customWidth="1"/></cols>
    <sheetData>${sheetData.join("")}</sheetData>
    <mergeCells count="${merged.length}">${merged.map((range) => `<mergeCell ref="${range}"/>`).join("")}</mergeCells>
  </worksheet>`;
}

function travelWorkbook(result) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", xmlHeader + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
    <Default Extension="xml" ContentType="application/xml"/>
    <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
    <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
    <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  </Types>`);
  zip.file("_rels/.rels", xmlHeader + `<Relationships xmlns="${packageRelationships}">
    <Relationship Id="rId1" Type="${officeRelationships}/officeDocument" Target="xl/workbook.xml"/>
  </Relationships>`);
  zip.file("xl/workbook.xml", xmlHeader + `<workbook xmlns="${sheetNamespace}" xmlns:r="${officeRelationships}">
    <sheets><sheet name="출장여비" sheetId="1" r:id="rId1"/></sheets>
  </workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", xmlHeader + `<Relationships xmlns="${packageRelationships}">
    <Relationship Id="rId1" Type="${officeRelationships}/worksheet" Target="worksheets/sheet1.xml"/>
    <Relationship Id="rId2" Type="${officeRelationships}/styles" Target="styles.xml"/>
  </Relationships>`);
  zip.file("xl/styles.xml", xmlHeader + `<styleSheet xmlns="${sheetNamespace}">
    <fonts count="2">
      <font><sz val="11"/><name val="맑은 고딕"/></font>
      <font><b/><sz val="11"/><name val="맑은 고딕"/></font>
    </fonts>
    <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
    <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
    <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
    <cellXfs count="5">
      <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
      <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
      <xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
      <xf numFmtId="3" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
      <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
    </cellXfs>
    <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
  </styleSheet>`);
  zip.file("xl/worksheets/sheet1.xml", xmlHeader + travelWorksheet(result));
  return zip.generateAsync({ type: "blob", mimeType: workbookMimeType });
}

async function downloadTravelWorkbook(result) {
  const blob = await travelWorkbook(result);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `출장여비_${result.start}_${result.end}.xlsx`;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}
