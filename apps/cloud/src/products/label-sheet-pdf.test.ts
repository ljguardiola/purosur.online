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
});
