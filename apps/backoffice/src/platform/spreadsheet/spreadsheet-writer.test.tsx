import { expect, test } from "vitest";
import { writeWorkbook } from "./spreadsheet-writer";
import { readXlsx } from "./test-support/read-xlsx";
import { type Cell, cell, type Workbook } from "./workbook";

function workbookOf(
  rows: Cell[][],
  header: string[] = (rows[0] ?? [cell.empty()]).map((_, column) => `Columna ${column + 1}`),
): Workbook {
  return { sheets: [{ name: "Hoja", header, rows }] };
}

function cellsOf(workbook: Workbook, sheet = 0) {
  return readXlsx(writeWorkbook(workbook)).sheet(sheet);
}

test("writes the parts of a workbook a spreadsheet opens, each one well-formed XML", () => {
  const file = readXlsx(writeWorkbook(workbookOf([[cell.text("a")]])));

  expect(Object.keys(file.parts).sort()).toEqual([
    "[Content_Types].xml",
    "_rels/.rels",
    "xl/_rels/workbook.xml.rels",
    "xl/styles.xml",
    "xl/workbook.xml",
    "xl/worksheets/sheet1.xml",
  ]);
});

test("names each sheet in order and links it to its worksheet part", () => {
  const file = readXlsx(
    writeWorkbook({
      sheets: [
        { name: "Resumen", header: ["Dato", "Valor"], rows: [] },
        { name: "Ventas por día", header: ["Día"], rows: [] },
      ],
    }),
  );

  expect(file.sheetNames).toEqual(["Resumen", "Ventas por día"]);
  const relationships = [
    ...(file.documents["xl/_rels/workbook.xml.rels"]?.querySelectorAll("Relationship") ?? []),
  ];
  const sheetIds = [...(file.documents["xl/workbook.xml"]?.querySelectorAll("sheet") ?? [])].map(
    (sheet) =>
      sheet.getAttribute("r:id") ??
      sheet.getAttributeNS(
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        "id",
      ),
  );
  const targets = sheetIds.map((id) =>
    relationships
      .find((relationship) => relationship.getAttribute("Id") === id)
      ?.getAttribute("Target"),
  );
  expect(targets).toEqual(["worksheets/sheet1.xml", "worksheets/sheet2.xml"]);
  expect(
    file.documents["[Content_Types].xml"]?.querySelectorAll("Override").length,
  ).toBeGreaterThanOrEqual(4);
});

test("writes the header row as bold text cells", () => {
  const cells = cellsOf(workbookOf([], ["Día", "Total"]));

  expect(cells.get("A1")).toMatchObject({ type: "inlineStr", value: "Día", bold: true });
  expect(cells.get("B1")).toMatchObject({ type: "inlineStr", value: "Total", bold: true });
});

test("writes text exactly, escaping markup characters and keeping surrounding spaces", () => {
  const cells = cellsOf(
    workbookOf([[cell.text('  Tom & "Jerry" <b>'), cell.text("Ñandú ¿qué? 🧀")]]),
  );

  expect(cells.get("A2")).toMatchObject({ type: "inlineStr", value: '  Tom & "Jerry" <b>' });
  expect(cells.get("B2")).toMatchObject({ type: "inlineStr", value: "Ñandú ¿qué? 🧀" });
});

test("drops characters XML cannot carry instead of corrupting the file", () => {
  const cells = cellsOf(workbookOf([[cell.text("a\u0000b\u0008c\td")]]));

  expect(cells.get("A2")?.value).toBe("abc\td");
});

test("writes a count as a number with a thousands format", () => {
  const cells = cellsOf(workbookOf([[cell.count(0), cell.count(1234)]]));

  expect(cells.get("A2")).toMatchObject({ type: null, value: "0", numberFormat: "#,##0" });
  expect(cells.get("B2")).toMatchObject({ type: null, value: "1234", numberFormat: "#,##0" });
});

test("writes a weight as kilograms from the integer thousandths with three decimals", () => {
  const cells = cellsOf(workbookOf([[cell.weight(186_400), cell.weight(5), cell.weight(0)]]));

  expect(cells.get("A2")).toMatchObject({ type: null, value: "186.4", numberFormat: "#,##0.000" });
  expect(cells.get("B2")?.value).toBe("0.005");
  expect(cells.get("C2")?.value).toBe("0");
});

test("writes money as pesos from the integer cents with no float error", () => {
  const cells = cellsOf(
    workbookOf([
      [cell.money(1_250_050), cell.money(5), cell.money(0), cell.money(-1_999)],
      [cell.money(Number.MAX_SAFE_INTEGER)],
    ]),
  );

  expect(cells.get("A2")).toMatchObject({
    type: null,
    value: "12500.5",
    numberFormat: '"$" #,##0.00',
  });
  expect(cells.get("B2")?.value).toBe("0.05");
  expect(cells.get("C2")?.value).toBe("0");
  expect(cells.get("D2")?.value).toBe("-19.99");
  expect(cells.get("A3")?.value).toBe("90071992547409.91");
});

test("writes a calendar day as a date serial counted from 1899-12-30", () => {
  const cells = cellsOf(
    workbookOf([[cell.day("1900-03-01"), cell.day("2026-10-02"), cell.day("1899-12-30")]]),
  );

  expect(cells.get("A2")).toMatchObject({ type: null, value: "61", numberFormat: "dd/mm/yyyy" });
  expect(cells.get("B2")?.value).toBe("46297");
  expect(cells.get("C2")?.value).toBe("0");
});

test("writes an instant as the date and time on the wall clock of the time zone it is given", () => {
  const zone = "America/Argentina/Buenos_Aires";
  const cells = cellsOf(
    workbookOf([
      [
        cell.instant("2026-10-02T17:30:00Z", zone),
        cell.instant("2026-10-02T14:30:00-03:00", zone),
        cell.instant("2026-10-03T02:15:30Z", zone),
        cell.instant("2026-10-02T17:30:00Z", "UTC"),
      ],
    ]),
  );

  expect(cells.get("A2")).toMatchObject({ type: null, numberFormat: "dd/mm/yyyy hh:mm" });
  expect(Number(cells.get("A2")?.value)).toBeCloseTo(46297 + (14 * 60 + 30) / 1440, 9);
  expect(Number(cells.get("B2")?.value)).toBeCloseTo(46297 + (14 * 60 + 30) / 1440, 9);
  expect(Number(cells.get("C2")?.value)).toBeCloseTo(46297 + (23 * 3600 + 15 * 60 + 30) / 86400, 9);
  expect(Number(cells.get("D2")?.value)).toBeCloseTo(46297 + (17 * 60 + 30) / 1440, 9);
});

test("writes a percentage as a fraction shown with one decimal", () => {
  const cells = cellsOf(workbookOf([[cell.percent(12.5), cell.percent(0), cell.percent(100)]]));

  expect(cells.get("A2")).toMatchObject({ type: null, value: "0.125", numberFormat: "0.0%" });
  expect(cells.get("B2")?.value).toBe("0");
  expect(cells.get("C2")?.value).toBe("1");
});

test("writes US dollars as dollars from the integer nano-USD", () => {
  const cells = cellsOf(workbookOf([[cell.usd(1_234_500_000), cell.usd(1), cell.usd(0)]]));

  expect(cells.get("A2")).toMatchObject({
    type: null,
    value: "1.2345",
    numberFormat: '"US$" #,##0.0000',
  });
  expect(cells.get("B2")?.value).toBe("0.000000001");
  expect(cells.get("C2")?.value).toBe("0");
});

test("writes an empty cell as no value and keeps the cells after it in their columns", () => {
  const cells = cellsOf(workbookOf([[cell.empty(), cell.text("después")]]));

  expect(cells.get("A2")?.value ?? null).toBeNull();
  expect(cells.get("B2")?.value).toBe("después");
});

test("addresses columns past Z with letters", () => {
  const row = Array.from({ length: 28 }, (_, index) => cell.count(index));
  const header = row.map((_, index) => `C${index}`);

  const cells = cellsOf(workbookOf([row], header));

  expect(cells.get("Z2")?.value).toBe("25");
  expect(cells.get("AA2")?.value).toBe("26");
  expect(cells.get("AB2")?.value).toBe("27");
});

test("freezes the header row and widens each column to fit its header and text", () => {
  const file = readXlsx(
    writeWorkbook(
      workbookOf(
        [[cell.text("x".repeat(40)), cell.count(1)]],
        ["Corta", "Una cabecera bastante larga"],
      ),
    ),
  );
  const worksheet = file.documents["xl/worksheets/sheet1.xml"];

  expect(worksheet?.querySelector("pane")?.getAttribute("state")).toBe("frozen");
  const widths = [...(worksheet?.querySelectorAll("cols > col") ?? [])].map((column) =>
    Number(column.getAttribute("width")),
  );
  expect(widths[0]).toBeGreaterThanOrEqual(40);
  expect(widths[1]).toBeGreaterThanOrEqual("Una cabecera bastante larga".length);
});

test("refuses a sheet name Excel would reject", () => {
  const named = (name: string): Workbook => ({ sheets: [{ name, header: ["a"], rows: [] }] });

  for (const invalid of [
    "",
    "x".repeat(32),
    "a[b",
    "a]b",
    "a:b",
    "a*b",
    "a?b",
    "a/b",
    "a\\b",
    "'a",
    "a'",
  ]) {
    expect(() => writeWorkbook(named(invalid)), invalid).toThrow();
  }
  expect(() => writeWorkbook(named("x".repeat(31)))).not.toThrow();
});

test("refuses two sheets with the same name, whatever the case", () => {
  expect(() =>
    writeWorkbook({
      sheets: [
        { name: "Ventas", header: ["a"], rows: [] },
        { name: "VENTAS", header: ["a"], rows: [] },
      ],
    }),
  ).toThrow();
});

test("refuses a workbook with no sheets and a row longer than its header", () => {
  expect(() => writeWorkbook({ sheets: [] })).toThrow();
  expect(() => writeWorkbook(workbookOf([[cell.text("a"), cell.text("b")]], ["Una"]))).toThrow();
});
