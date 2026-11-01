import { strToU8, zipSync } from "fflate";
import type { Cell, Sheet, Workbook } from "./workbook";

const SPREADSHEET_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const RELATIONSHIPS_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_RELATIONSHIPS_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const CONTENT_TYPES_NS = "http://schemas.openxmlformats.org/package/2006/content-types";
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

const MAX_SHEET_NAME_LENGTH = 31;
const FORBIDDEN_SHEET_NAME_CHARACTERS = /[[\]:*?/\\]/;
const MS_PER_DAY = 86_400_000;
const SPREADSHEET_DAY_ZERO_MS = Date.UTC(1899, 11, 30);
const MIN_COLUMN_WIDTH = 12;
const MAX_COLUMN_WIDTH = 60;
const NANO_USD_PER_USD = 1_000_000_000n;

type StyleName =
  | "general"
  | "header"
  | "count"
  | "weight"
  | "money"
  | "day"
  | "instant"
  | "percent"
  | "usd";

const STYLES: { name: StyleName; numFmtId: number; formatCode?: string; bold?: boolean }[] = [
  { name: "general", numFmtId: 0 },
  { name: "header", numFmtId: 0, bold: true },
  { name: "count", numFmtId: 3 },
  { name: "weight", numFmtId: 169, formatCode: "#,##0.000" },
  { name: "money", numFmtId: 164, formatCode: '"$" #,##0.00' },
  { name: "day", numFmtId: 165, formatCode: "dd/mm/yyyy" },
  { name: "instant", numFmtId: 166, formatCode: "dd/mm/yyyy hh:mm" },
  { name: "percent", numFmtId: 167, formatCode: "0.0%" },
  { name: "usd", numFmtId: 168, formatCode: '"US$" #,##0.0000' },
];

const styleIndex = (name: StyleName) => STYLES.findIndex((style) => style.name === name);

function isXmlCharacter(code: number): boolean {
  return (
    code === 0x9 ||
    code === 0xa ||
    code === 0xd ||
    (code >= 0x20 && code <= 0xd7ff) ||
    (code >= 0xe000 && code <= 0xfffd) ||
    code >= 0x10000
  );
}

function escapeXml(text: string): string {
  return Array.from(text)
    .filter((character) => isXmlCharacter(character.codePointAt(0) ?? 0))
    .join("")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function columnLetters(index: number): string {
  let letters = "";
  for (let rest = index + 1; rest > 0; rest = Math.floor((rest - 1) / 26)) {
    letters = String.fromCharCode(65 + ((rest - 1) % 26)) + letters;
  }
  return letters;
}

function decimalFromScaledInteger(units: number, scale: bigint, digits: number): string {
  const absolute = BigInt(Math.abs(units));
  const whole = absolute / scale;
  const fraction = String(absolute % scale)
    .padStart(digits, "0")
    .replace(/0+$/, "");
  const sign = units < 0 && absolute !== 0n ? "-" : "";
  return `${sign}${whole}${fraction === "" ? "" : `.${fraction}`}`;
}

function daySerial(day: string): number {
  return (Date.parse(`${day}T00:00:00Z`) - SPREADSHEET_DAY_ZERO_MS) / MS_PER_DAY;
}

function wallClockParts(instant: Date, timeZone: string): Record<string, number> {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(instant);
  return Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
}

function instantSerial(instant: string, timeZone: string): number {
  const moment = new Date(instant);
  if (Number.isNaN(moment.getTime())) {
    throw new Error(`Not an instant: ${instant}`);
  }
  const wall = wallClockParts(moment, timeZone);
  const wallClockMs = Date.UTC(
    wall["year"] ?? 0,
    (wall["month"] ?? 1) - 1,
    wall["day"] ?? 1,
    wall["hour"] ?? 0,
    wall["minute"] ?? 0,
    wall["second"] ?? 0,
  );
  return (wallClockMs - SPREADSHEET_DAY_ZERO_MS) / MS_PER_DAY;
}

function numberCell(reference: string, style: StyleName, value: string): string {
  return `<c r="${reference}" s="${styleIndex(style)}"><v>${value}</v></c>`;
}

function textCell(reference: string, style: StyleName, text: string): string {
  return `<c r="${reference}" s="${styleIndex(style)}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
}

function cellXml(cell: Cell, reference: string): string {
  switch (cell.kind) {
    case "text":
      return textCell(reference, "general", cell.value);
    case "count":
      return numberCell(reference, "count", String(cell.value));
    case "weight":
      return numberCell(reference, "weight", decimalFromScaledInteger(cell.thousandths, 1000n, 3));
    case "money":
      return numberCell(reference, "money", decimalFromScaledInteger(cell.cents, 100n, 2));
    case "day":
      return numberCell(reference, "day", String(daySerial(cell.day)));
    case "instant":
      return numberCell(reference, "instant", String(instantSerial(cell.instant, cell.timeZone)));
    case "percent":
      return numberCell(reference, "percent", String(Number((cell.percent / 100).toPrecision(15))));
    case "usd":
      return numberCell(
        reference,
        "usd",
        decimalFromScaledInteger(cell.nanoUsd, NANO_USD_PER_USD, 9),
      );
    case "empty":
      return "";
  }
}

function columnWidths(sheet: Sheet): number[] {
  return sheet.header.map((header, column) => {
    const longest = Math.max(
      header.length,
      ...sheet.rows.map((row) => {
        const cell = row[column];
        return cell?.kind === "text" ? cell.value.length : 0;
      }),
    );
    return Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, longest + 2));
  });
}

function worksheetXml(sheet: Sheet): string {
  const headerRow = `<row r="1">${sheet.header
    .map((title, column) => textCell(`${columnLetters(column)}1`, "header", title))
    .join("")}</row>`;
  const rows = sheet.rows.map((row, index) => {
    if (row.length > sheet.header.length) {
      throw new Error(`Row ${index + 1} of "${sheet.name}" has more cells than the header`);
    }
    const number = index + 2;
    return `<row r="${number}">${row
      .map((cell, column) => cellXml(cell, `${columnLetters(column)}${number}`))
      .join("")}</row>`;
  });
  const columns = columnWidths(sheet)
    .map(
      (width, column) =>
        `<col min="${column + 1}" max="${column + 1}" width="${width}" customWidth="1"/>`,
    )
    .join("");
  return (
    `${XML_DECLARATION}<worksheet xmlns="${SPREADSHEET_NS}">` +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `<cols>${columns}</cols><sheetData>${headerRow}${rows.join("")}</sheetData></worksheet>`
  );
}

function stylesXml(): string {
  const formats = STYLES.filter((style) => style.formatCode !== undefined)
    .map(
      (style) =>
        `<numFmt numFmtId="${style.numFmtId}" formatCode="${escapeXml(style.formatCode ?? "")}"/>`,
    )
    .join("");
  const cellFormats = STYLES.map(
    (style) =>
      `<xf numFmtId="${style.numFmtId}" fontId="${style.bold ? 1 : 0}" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"${style.bold ? ' applyFont="1"' : ""}/>`,
  ).join("");
  return (
    `${XML_DECLARATION}<styleSheet xmlns="${SPREADSHEET_NS}">` +
    `<numFmts count="${STYLES.filter((style) => style.formatCode !== undefined).length}">${formats}</numFmts>` +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    `<cellXfs count="${STYLES.length}">${cellFormats}</cellXfs>` +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    "</styleSheet>"
  );
}

function checkSheetNames(sheets: Sheet[]): void {
  if (sheets.length === 0) {
    throw new Error("A workbook needs at least one sheet");
  }
  const seen = new Set<string>();
  for (const { name } of sheets) {
    if (
      name === "" ||
      name.length > MAX_SHEET_NAME_LENGTH ||
      FORBIDDEN_SHEET_NAME_CHARACTERS.test(name) ||
      name.startsWith("'") ||
      name.endsWith("'")
    ) {
      throw new Error(`Not a valid sheet name: "${name}"`);
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      throw new Error(`Two sheets are named "${name}"`);
    }
    seen.add(key);
  }
}

export function writeWorkbook(workbook: Workbook): Uint8Array {
  checkSheetNames(workbook.sheets);
  const sheetNumbers = workbook.sheets.map((_, index) => index + 1);
  const worksheets = Object.fromEntries(
    workbook.sheets.map((sheet, index) => [
      `xl/worksheets/sheet${index + 1}.xml`,
      strToU8(worksheetXml(sheet)),
    ]),
  );
  return zipSync({
    "[Content_Types].xml": strToU8(
      `${XML_DECLARATION}<Types xmlns="${CONTENT_TYPES_NS}">` +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        sheetNumbers
          .map(
            (number) =>
              `<Override PartName="/xl/worksheets/sheet${number}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join("") +
        "</Types>",
    ),
    "_rels/.rels": strToU8(
      `${XML_DECLARATION}<Relationships xmlns="${PACKAGE_RELATIONSHIPS_NS}">` +
        `<Relationship Id="rId1" Type="${RELATIONSHIPS_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `${XML_DECLARATION}<workbook xmlns="${SPREADSHEET_NS}" xmlns:r="${RELATIONSHIPS_NS}"><sheets>` +
        workbook.sheets
          .map(
            (sheet, index) =>
              `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
          )
          .join("") +
        "</sheets></workbook>",
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `${XML_DECLARATION}<Relationships xmlns="${PACKAGE_RELATIONSHIPS_NS}">` +
        sheetNumbers
          .map(
            (number) =>
              `<Relationship Id="rId${number}" Type="${RELATIONSHIPS_NS}/worksheet" Target="worksheets/sheet${number}.xml"/>`,
          )
          .join("") +
        `<Relationship Id="rId${sheetNumbers.length + 1}" Type="${RELATIONSHIPS_NS}/styles" Target="styles.xml"/></Relationships>`,
    ),
    "xl/styles.xml": strToU8(stylesXml()),
    ...worksheets,
  });
}
