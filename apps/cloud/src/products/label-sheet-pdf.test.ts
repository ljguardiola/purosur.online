import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { LABELS_PER_PAGE } from "./label-sheet-layout.js";
import { renderLabelSheetPdf } from "./label-sheet-pdf.js";

interface PdfObject {
  dictionary: string;
  stream: Buffer | undefined;
}

/**
 * Splits a pdfkit-written PDF into its numbered objects, inflating each FlateDecode stream, so
 * tests read the same compressed bytes production serves without a full PDF parser.
 */
function pdfObjects(pdf: Buffer): Map<number, PdfObject> {
  const text = pdf.toString("latin1");
  const objects = new Map<number, PdfObject>();
  for (const match of text.matchAll(/(\d+) 0 obj\n/g)) {
    const start = (match.index ?? 0) + match[0].length;
    const body = text.slice(start, text.indexOf("\nendobj", start));
    const streamStart = body.indexOf("\nstream\n");
    if (streamStart === -1) {
      objects.set(Number(match[1]), { dictionary: body, stream: undefined });
      continue;
    }
    const dictionary = body.slice(0, streamStart);
    const dataStart = start + streamStart + "\nstream\n".length;
    const raw = pdf.subarray(dataStart, dataStart + Number(dictionary.match(/\/Length (\d+)/)?.[1]));
    const stream = dictionary.includes("/FlateDecode") ? inflateSync(raw) : raw;
    objects.set(Number(match[1]), { dictionary, stream });
  }
  return objects;
}

function objectAt(objects: Map<number, PdfObject>, id: number | string | undefined): PdfObject {
  const object = objects.get(Number(id));
  if (!object) {
    throw new Error(`the rendered PDF has no object ${id}`);
  }
  return object;
}

/** A ToUnicode CMap's `bfrange` arrays and `bfchar` pairs, as pdfkit writes them. */
function toUnicodeMap(cmap: string): Map<number, string> {
  const utf16 = (hex: string) => Buffer.from(hex, "hex").swap16().toString("utf16le");
  const map = new Map<number, string>();
  for (const range of cmap.matchAll(/<([0-9a-f]+)> <[0-9a-f]+> \[([^\]]*)\]/g)) {
    const values = [...(range[2] ?? "").matchAll(/<([0-9a-f]+)>/g)];
    values.forEach((value, offset) => {
      map.set(Number.parseInt(range[1] ?? "", 16) + offset, utf16(value[1] ?? ""));
    });
  }
  for (const pair of cmap.matchAll(/<([0-9a-f]{4})> <([0-9a-f]+)>\n/g)) {
    map.set(Number.parseInt(pair[1] ?? "", 16), utf16(pair[2] ?? ""));
  }
  return map;
}

interface RenderedFont {
  baseFont: string;
  embedded: boolean;
  /** The font's ascent over 1000 units of its size, from its descriptor; undefined when built in. */
  ascent: number | undefined;
  toUnicode: Map<number, string> | undefined;
}

function renderedFont(objects: Map<number, PdfObject>, id: string): RenderedFont {
  const { dictionary } = objectAt(objects, id);
  const baseFont = dictionary.match(/\/BaseFont \/(\S+)/)?.[1] ?? "";
  const toUnicodeId = dictionary.match(/\/ToUnicode (\d+) 0 R/)?.[1];
  const descendantId = dictionary.match(/\/DescendantFonts \[(\d+) 0 R\]/)?.[1];
  if (!toUnicodeId || !descendantId) {
    return { baseFont, embedded: false, ascent: undefined, toUnicode: undefined };
  }
  const descriptorId = objectAt(objects, descendantId).dictionary.match(
    /\/FontDescriptor (\d+) 0 R/,
  )?.[1];
  const descriptor = objectAt(objects, descriptorId).dictionary;
  return {
    baseFont,
    embedded: /\/FontFile2 \d+ 0 R/.test(descriptor),
    ascent: Number(descriptor.match(/\/Ascent ([\d.]+)/)?.[1]),
    toUnicode: toUnicodeMap(objectAt(objects, toUnicodeId).stream?.toString("latin1") ?? ""),
  };
}

interface RenderedText {
  text: string;
  font: RenderedFont;
  fontSizePt: number;
  /** The text's baseline, in points from the page's top edge. */
  baselinePt: number;
  pageIndex: number;
}

function pageDictionaries(objects: Map<number, PdfObject>): string[] {
  const pages = [...objects.values()].find((object) => /\/Type \/Pages\n/.test(object.dictionary));
  const kids = [...(pages?.dictionary.match(/\/Kids \[([^\]]*)\]/)?.[1] ?? "").matchAll(/(\d+) 0 R/g)];
  return kids.map((kid) => objectAt(objects, kid[1]).dictionary);
}

function pageContents(objects: Map<number, PdfObject>): string[] {
  return pageDictionaries(objects).map(
    (page) =>
      objectAt(objects, page.match(/\/Contents (\d+) 0 R/)?.[1]).stream?.toString("latin1") ?? "",
  );
}

/**
 * Every `[<hex>...] TJ` show-text operator of every page, decoded through the font selected by
 * the `Tf` before it: an embedded font's codes through its ToUnicode CMap (an unmapped code, or the
 * `.notdef` glyph 0, as U+FFFD), a built-in font's WinAnsi bytes as Latin-1.
 */
function renderedTextRuns(pdf: Buffer): RenderedText[] {
  const objects = pdfObjects(pdf);
  const fontIds = new Map<string, string>();
  for (const object of objects.values()) {
    for (const entry of object.dictionary.matchAll(/\/(F\d+) (\d+) 0 R/g)) {
      fontIds.set(entry[1] ?? "", entry[2] ?? "");
    }
  }
  const pageHeights = pageDictionaries(objects).map((page) =>
    Number(page.match(/\/MediaBox \[0 0 [\d.]+ ([\d.]+)\]/)?.[1]),
  );

  const runs: RenderedText[] = [];
  pageContents(objects).forEach((content, pageIndex) => {
    let font: RenderedFont | undefined;
    let fontSizePt = 0;
    let baselineFromBottomPt = 0;
    const operators = /\/(F\d+) ([\d.]+) Tf|1 0 0 1 [\d.-]+ ([\d.-]+) Tm|\[([^\]]*)\] TJ/g;
    for (const operator of content.matchAll(operators)) {
      if (operator[1]) {
        font = renderedFont(objects, fontIds.get(operator[1]) ?? "");
        fontSizePt = Number(operator[2]);
      } else if (operator[3]) {
        baselineFromBottomPt = Number(operator[3]);
      } else if (font) {
        const hex = [...(operator[4] ?? "").matchAll(/<([0-9a-f]+)>/g)].map((m) => m[1]).join("");
        const toUnicode = font.toUnicode;
        const text = toUnicode
          ? (hex.match(/.{4}/g) ?? [])
              .map((code) => Number.parseInt(code, 16))
              .map((code) => (code === 0 ? "�" : (toUnicode.get(code) ?? "�")))
              .join("")
          : Buffer.from(hex, "hex").toString("latin1");
        runs.push({
          text,
          font,
          fontSizePt,
          baselinePt: (pageHeights[pageIndex] ?? 0) - baselineFromBottomPt,
          pageIndex,
        });
      }
    }
  });
  return runs;
}

function renderedTexts(pdf: Buffer): string[] {
  return renderedTextRuns(pdf).map((run) => run.text);
}

function pageCount(pdf: Buffer): number {
  return pageDictionaries(pdfObjects(pdf)).length;
}

/** Every drawn rectangle `<x> <y> <w> <h> re`, in points from the page's top-left corner. */
function barRectangles(pdf: Buffer): { yPt: number; heightPt: number }[] {
  return pageContents(pdfObjects(pdf)).flatMap((content) =>
    [...content.matchAll(/[\d.]+ ([\d.]+) [\d.]+ ([\d.]+) re/g)].map((match) => ({
      yPt: Number(match[1]),
      heightPt: Number(match[2]),
    })),
  );
}

function firstBarY(pdf: Buffer): number {
  const [first] = barRectangles(pdf);
  if (!first) {
    throw new Error("no bar rectangle found in the rendered PDF");
  }
  return first.yPt;
}

describe("renderLabelSheetPdf", () => {
  it("compresses every stream it writes", async () => {
    const pdf = await renderLabelSheetPdf([{ name: "Maceta", code: "2000000000015", count: 1 }]);
    const streams = [...pdfObjects(pdf).values()].filter((object) => object.stream);

    expect(streams.length).toBeGreaterThan(0);
    for (const object of streams) {
      expect(object.dictionary).toContain("/Filter /FlateDecode");
    }
  });

  it("keeps the largest allowed request, 2400 labels over 100 sheets, under 2 MB", async () => {
    const items = Array.from({ length: 100 }, (_, index) => ({
      name: `Harina de almendras integral orgánica sin gluten ${index}`,
      code: "2000000000015",
      count: LABELS_PER_PAGE,
    }));

    const pdf = await renderLabelSheetPdf(items);

    expect(pageCount(pdf)).toBe(100);
    expect(pdf.length).toBeLessThan(2 * 1024 * 1024);
  });

  it("produces a valid PDF document", async () => {
    const pdf = await renderLabelSheetPdf([{ name: "Maceta", code: "2000000000015", count: 1 }]);

    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("renders one page per 24 labels, product by product", async () => {
    const pdf = await renderLabelSheetPdf([
      { name: "Maceta", code: "2000000000015", count: LABELS_PER_PAGE + 1 },
    ]);

    expect(pageCount(pdf)).toBe(2);
  });

  it("renders each product's name and its barcode's human-readable digits", async () => {
    const pdf = await renderLabelSheetPdf([
      { name: "Almendras peladas", code: "2000000000015", count: 1 },
      { name: "Nueces mariposa", code: "2912345678906", count: 1 },
    ]);
    const texts = renderedTexts(pdf);

    expect(texts).toContain("Almendras peladas");
    expect(texts).toContain("Nueces mariposa");
    // 2000000000015's first digit, then its two 6-digit halves either side of the check digit.
    expect(texts).toContain("000000");
    expect(texts).toContain("000015");
    // 2912345678906's own halves, proving the digits come from each product's own code.
    expect(texts).toContain("912345");
    expect(texts).toContain("678906");
  });

  it("renders Spanish accented names using the built-in font's WinAnsi encoding", async () => {
    const pdf = await renderLabelSheetPdf([
      { name: "Semillas de chía", code: "2000000000015", count: 1 },
      { name: "Ñandú", code: "2000000000022", count: 1 },
    ]);
    const texts = renderedTexts(pdf);

    expect(texts).toContain("Semillas de chía");
    expect(texts).toContain("Ñandú");
  });

  it("renders the human-readable digits in a bold monospace font, matching the proof's weight", async () => {
    const pdf = await renderLabelSheetPdf([{ name: "Maceta", code: "2000000000015", count: 1 }]);
    const content = pdf.toString("latin1");

    expect(content).toContain("/BaseFont /Courier-Bold");
    expect(/\/BaseFont \/Courier(?!-)/.test(content)).toBe(false);
  });

  it("centers the whole content group, so a 2-line name pushes its barcode lower than a 1-line name's", async () => {
    const oneLinePdf = await renderLabelSheetPdf([
      { name: "Maceta", code: "2000000000015", count: 1 },
    ]);
    const twoLinePdf = await renderLabelSheetPdf([
      {
        name: "Harina de almendras integral orgánica sin gluten y sin azúcar añadido",
        code: "2000000000015",
        count: 1,
      },
    ]);

    expect(firstBarY(twoLinePdf)).toBeGreaterThan(firstBarY(oneLinePdf));
  });

  it("wraps a name across two lines by words instead of truncating it to one", async () => {
    const pdf = await renderLabelSheetPdf([
      {
        name: "Harina de almendras integral orgánica sin gluten",
        code: "2000000000015",
        count: 1,
      },
    ]);
    const texts = renderedTexts(pdf).map((text) => text.trim());

    expect(texts).toContain("Harina de almendras");
    expect(texts).toContain("integral orgánica sin gluten");
    // pdfkit's ellipsis is a single WinAnsi byte (0x85), which `latin1` decodes as U+0085.
    expect(texts.some((text) => text.includes("\u0085"))).toBe(false);
  });

  it("ellipsizes only the second line when a name still doesn't fit in two lines", async () => {
    const pdf = await renderLabelSheetPdf([
      {
        name: "Harina de almendras integral orgánica sin gluten y sin azúcar añadido nunca jamás",
        code: "2000000000015",
        count: 1,
      },
    ]);
    const nameLines = renderedTexts(pdf).filter((text) => /[A-Za-zÁÉÍÓÚÑáéíóúñ]{3,}/.test(text));

    expect(nameLines).toHaveLength(2);
    expect(nameLines[0]).not.toContain("\u0085");
    expect(nameLines[1]).toContain("\u0085");
  });
});
