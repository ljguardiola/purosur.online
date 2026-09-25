import { describe, expect, it } from "vitest";
import { LABELS_PER_PAGE } from "./label-sheet-layout.js";
import { renderLabelSheetPdf } from "./label-sheet-pdf.js";

/**
 * PDFs are rendered uncompressed (`compress: false`), so a label's text is readable straight from
 * its content stream as `[<hex>...] TJ` show-text operators: decoding those hex strings is enough
 * to assert on rendered names and barcode digits without a full PDF parser.
 */
function renderedTexts(pdf: Buffer): string[] {
  const content = pdf.toString("latin1");
  return [...content.matchAll(/\[((?:<[0-9a-f]+>\s*-?\d+\s*)+)\] TJ/g)].map((match) => {
    const hex = [...(match[1] ?? "").matchAll(/<([0-9a-f]+)>/g)].map((m) => m[1]).join("");
    return Buffer.from(hex, "hex").toString("latin1");
  });
}

function pageCount(pdf: Buffer): number {
  const match = pdf.toString("latin1").match(/\/Type\s*\/Pages[\s\S]*?\/Count\s+(\d+)/);
  return match?.[1] ? Number(match[1]) : 0;
}

/** The y (in points) of the first drawn bar rectangle: `<x> <y> <w> <h> re`. */
function firstBarY(pdf: Buffer): number {
  const match = pdf.toString("latin1").match(/[\d.]+ ([\d.]+) [\d.]+ [\d.]+ re/);
  if (!match?.[1]) {
    throw new Error("no bar rectangle found in the rendered PDF");
  }
  return Number(match[1]);
}

describe("renderLabelSheetPdf", () => {
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
