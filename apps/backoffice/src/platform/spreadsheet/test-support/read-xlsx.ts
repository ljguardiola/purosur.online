import { unzipSync } from "fflate";

export type ReadCell = {
  type: string | null;
  value: string | null;
  numberFormat: string | null;
  bold: boolean;
};

const PARSER = new DOMParser();
const BUILT_IN_NUMBER_FORMATS: Record<string, string> = { "0": "General", "3": "#,##0" };

export function parseXml(text: string): Document {
  const document = PARSER.parseFromString(text, "application/xml");
  const error = document.querySelector("parsererror");
  if (error) {
    throw new Error(`Malformed XML: ${error.textContent}`);
  }
  return document;
}

export function readXlsx(file: Uint8Array) {
  const parts = Object.fromEntries(
    Object.entries(unzipSync(file)).map(([name, bytes]) => [name, new TextDecoder().decode(bytes)]),
  );
  const documents = Object.fromEntries(
    Object.entries(parts).map(([name, text]) => [name, parseXml(text)]),
  );
  const styles = documents["xl/styles.xml"];
  if (!styles) {
    throw new Error("The file has no styles part");
  }
  const customFormats = new Map(
    [...styles.querySelectorAll("numFmts > numFmt")].map((format) => [
      format.getAttribute("numFmtId") ?? "",
      format.getAttribute("formatCode") ?? "",
    ]),
  );
  const fontBold = [...styles.querySelectorAll("fonts > font")].map(
    (font) => font.querySelector("b") !== null,
  );
  const styleOf = (index: number) => {
    const xf = styles.querySelectorAll("cellXfs > xf")[index];
    const id = xf?.getAttribute("numFmtId") ?? "0";
    return {
      numberFormat: customFormats.get(id) ?? BUILT_IN_NUMBER_FORMATS[id] ?? `builtin ${id}`,
      bold: fontBold[Number(xf?.getAttribute("fontId") ?? "0")] ?? false,
    };
  };

  const sheetNames = [
    ...(documents["xl/workbook.xml"]?.querySelectorAll("sheets > sheet") ?? []),
  ].map((sheet) => sheet.getAttribute("name") ?? "");

  function sheet(index: number): Map<string, ReadCell> {
    const document = documents[`xl/worksheets/sheet${index + 1}.xml`];
    if (!document) {
      throw new Error(`No worksheet ${index + 1}`);
    }
    return new Map(
      [...document.querySelectorAll("sheetData > row > c")].map((cell) => {
        const type = cell.getAttribute("t");
        const value =
          type === "inlineStr"
            ? (cell.querySelector("is > t")?.textContent ?? "")
            : (cell.querySelector("v")?.textContent ?? null);
        return [
          cell.getAttribute("r") ?? "",
          { type, value, ...styleOf(Number(cell.getAttribute("s") ?? "0")) },
        ];
      }),
    );
  }

  return { parts, documents, sheetNames, sheet };
}

export async function readDownloadedXlsx(blob: Blob | undefined) {
  if (blob === undefined) {
    throw new Error("Nothing was downloaded");
  }
  return readXlsx(new Uint8Array(await blob.arrayBuffer()));
}
