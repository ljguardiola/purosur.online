import { describe, expect, it } from "vitest";
import {
  pageContents,
  pageDictionaries,
  pdfObjectsWithInflatedStreams,
  renderedTextRuns,
  renderedTexts,
} from "../platform/test-support/rendered-pdf.js";
import { PADDING_TOP_BOTTOM_MM, PT_PER_MM } from "./label-content-layout.js";
import { LABEL_HEIGHT_MM, LABELS_PER_PAGE } from "./label-sheet-layout.js";
import { renderLabelSheetPdf } from "./label-sheet-pdf.js";

const CREATED_AT = new Date("2026-01-05T12:00:00.000Z");

function pageCount(pdf: Buffer): number {
  return pageDictionaries(pdfObjectsWithInflatedStreams(pdf)).length;
}

/** Every drawn rectangle `<x> <y> <w> <h> re`, in points from the page's top-left corner. */
function barRectangles(pdf: Buffer): { yPt: number; heightPt: number }[] {
  return pageContents(pdfObjectsWithInflatedStreams(pdf)).flatMap((content) =>
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
    const pdf = await renderLabelSheetPdf(
      [{ name: "Maceta", brandName: null, netContent: null, code: "2000000000015", count: 1 }],
      CREATED_AT,
    );
    const streams = [...pdfObjectsWithInflatedStreams(pdf).values()].filter(
      (object) => object.stream,
    );

    expect(streams.length).toBeGreaterThan(0);
    for (const object of streams) {
      expect(object.dictionary).toContain("/Filter /FlateDecode");
    }
  });

  it("keeps the largest allowed request, 2400 labels over 100 sheets, under 2 MB", async () => {
    const items = Array.from({ length: 100 }, (_, index) => ({
      name: `Harina de almendras integral orgánica sin gluten ${index}`,
      brandName: null,
      netContent: null,
      code: "2000000000015",
      count: LABELS_PER_PAGE,
    }));

    const pdf = await renderLabelSheetPdf(items, CREATED_AT);

    expect(pageCount(pdf)).toBe(100);
    expect(pdf.length).toBeLessThan(2 * 1024 * 1024);
  });

  it("dates the document with the creation time it is given", async () => {
    const pdf = await renderLabelSheetPdf(
      [{ name: "Maceta", brandName: null, netContent: null, code: "2000000000015", count: 1 }],
      new Date("2026-01-05T12:00:00.000Z"),
    );

    expect(pdf.toString("latin1")).toContain("(D:20260105120000Z)");
  });

  it("produces a valid PDF document", async () => {
    const pdf = await renderLabelSheetPdf(
      [{ name: "Maceta", brandName: null, netContent: null, code: "2000000000015", count: 1 }],
      CREATED_AT,
    );

    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("renders one page per 24 labels, product by product", async () => {
    const pdf = await renderLabelSheetPdf(
      [
        {
          name: "Maceta",
          brandName: null,
          netContent: null,
          code: "2000000000015",
          count: LABELS_PER_PAGE + 1,
        },
      ],
      CREATED_AT,
    );

    expect(pageCount(pdf)).toBe(2);
  });

  it("renders each product's name and its barcode's human-readable digits", async () => {
    const pdf = await renderLabelSheetPdf(
      [
        {
          name: "Almendras peladas",
          brandName: null,
          netContent: null,
          code: "2000000000015",
          count: 1,
        },
        {
          name: "Nueces mariposa",
          brandName: null,
          netContent: null,
          code: "2912345678906",
          count: 1,
        },
      ],
      CREATED_AT,
    );
    const texts = renderedTexts(pdf);

    expect(texts).toContain("Almendras peladas");
    expect(texts).toContain("Nueces mariposa");
    expect(texts).toContain("000000");
    expect(texts).toContain("000015");
    expect(texts).toContain("912345");
    expect(texts).toContain("678906");
  });

  it("renders Spanish accented names", async () => {
    const pdf = await renderLabelSheetPdf(
      [
        {
          name: "Semillas de chía",
          brandName: null,
          netContent: null,
          code: "2000000000015",
          count: 1,
        },
        { name: "Ñandú", brandName: null, netContent: null, code: "2000000000022", count: 1 },
      ],
      CREATED_AT,
    );
    const texts = renderedTexts(pdf);

    expect(texts).toContain("Semillas de chía");
    expect(texts).toContain("Ñandú");
  });

  it("renders letters and symbols outside Latin-1 as real glyphs of an embedded bold font", async () => {
    const names = ["Omega Ω 3", "Kőrösi", "Мёд", "≈ 1 kg"];
    const pdf = await renderLabelSheetPdf(
      names.map((name) => ({
        name,
        brandName: null,
        netContent: null,
        code: "2000000000015",
        count: 1,
      })),
      CREATED_AT,
    );
    const nameRuns = renderedTextRuns(pdf).filter((run) => names.includes(run.text));

    expect(nameRuns.map((run) => run.text).sort()).toEqual([...names].sort());
    for (const run of nameRuns) {
      expect(run.font.embedded).toBe(true);
      expect(run.font.baseFont).toMatch(/\+LiberationSans-Bold$/);
    }
    expect(renderedTexts(pdf).some((text) => text.includes("�"))).toBe(false);
  });

  it("renders the human-readable digits in a bold monospace font, matching the proof's weight", async () => {
    const pdf = await renderLabelSheetPdf(
      [{ name: "Maceta", brandName: null, netContent: null, code: "2000000000015", count: 1 }],
      CREATED_AT,
    );
    const content = pdf.toString("latin1");

    expect(content).toContain("/BaseFont /Courier-Bold");
    expect(/\/BaseFont \/Courier(?!-)/.test(content)).toBe(false);
  });

  it("centers the whole content group, so a 2-line name pushes its barcode lower than a 1-line name's", async () => {
    const oneLinePdf = await renderLabelSheetPdf(
      [{ name: "Maceta", brandName: null, netContent: null, code: "2000000000015", count: 1 }],
      CREATED_AT,
    );
    const twoLinePdf = await renderLabelSheetPdf(
      [
        {
          name: "Harina de almendras integral orgánica sin gluten y sin azúcar añadido",
          brandName: null,
          netContent: null,
          code: "2000000000015",
          count: 1,
        },
      ],
      CREATED_AT,
    );

    expect(firstBarY(twoLinePdf)).toBeGreaterThan(firstBarY(oneLinePdf));
  });

  it("wraps a name across two lines by words instead of truncating it to one", async () => {
    const pdf = await renderLabelSheetPdf(
      [
        {
          name: "Harina de almendras integral orgánica sin gluten",
          brandName: null,
          netContent: null,
          code: "2000000000015",
          count: 1,
        },
      ],
      CREATED_AT,
    );
    const texts = renderedTexts(pdf).map((text) => text.trim());

    expect(texts).toContain("Harina de almendras");
    expect(texts).toContain("integral orgánica sin gluten");
    expect(texts.some((text) => text.includes("…"))).toBe(false);
  });

  it("ellipsizes only the second line when a name still doesn't fit in two lines", async () => {
    const pdf = await renderLabelSheetPdf(
      [
        {
          name: "Harina de almendras integral orgánica sin gluten y sin azúcar añadido nunca jamás",
          brandName: null,
          netContent: null,
          code: "2000000000015",
          count: 1,
        },
      ],
      CREATED_AT,
    );
    const nameLines = renderedTexts(pdf).filter((text) => /[A-Za-zÁÉÍÓÚÑáéíóúñ]{3,}/.test(text));

    expect(nameLines).toHaveLength(2);
    expect(nameLines[0]).not.toContain("…");
    expect(nameLines[1]).toContain("…");
  });

  it("fits a description too long for two lines the way a long name is fitted, keeping its barcode inside the label's padded box", async () => {
    const pdf = await renderLabelSheetPdf(
      [
        {
          name: "Harina de almendras integral orgánica sin gluten",
          brandName: "Molinos Australes del Valle",
          netContent: { quantity: 1, unit: "KG" },
          code: "2000000000015",
          count: 1,
        },
      ],
      CREATED_AT,
    );
    const nameLines = renderedTexts(pdf).filter((text) => /[A-Za-zÁÉÍÓÚÑáéíóúñ]{3,}/.test(text));
    const paddedBottomPt = (LABEL_HEIGHT_MM - PADDING_TOP_BOTTOM_MM) * PT_PER_MM;

    expect(nameLines).toHaveLength(2);
    expect(nameLines[0]).not.toContain("…");
    expect(nameLines[1]).toContain("…");
    for (const bar of barRectangles(pdf)) {
      expect(bar.yPt + bar.heightPt).toBeLessThanOrEqual(paddedBottomPt);
    }
  });

  it.each([
    ["a 1-line", "Ñandú Ávila"],
    ["a 2-line", "Ñandú Ávila Émile Óleo Úrsula Íñigo Ángel"],
  ])(
    "keeps %s name's accented capitals and the barcode inside the label's padded box",
    async (_, name) => {
      const pdf = await renderLabelSheetPdf(
        [{ name, brandName: null, netContent: null, code: "2000000000015", count: 1 }],
        CREATED_AT,
      );
      const runs = renderedTextRuns(pdf);
      const nameRuns = runs.filter((run) => run.font.embedded);
      const digitRuns = runs.filter((run) => run.font.baseFont === "Courier-Bold");
      const paddedTopPt = PADDING_TOP_BOTTOM_MM * PT_PER_MM;
      const paddedBottomPt = (LABEL_HEIGHT_MM - PADDING_TOP_BOTTOM_MM) * PT_PER_MM;

      expect(nameRuns.length).toBe(name.length > 20 ? 2 : 1);
      for (const run of nameRuns) {
        // A font's ascent, from its descriptor, is per 1000 units of its size.
        const glyphTopPt = run.baselinePt - ((run.font.ascent ?? 0) / 1000) * run.fontSizePt;
        expect(glyphTopPt).toBeGreaterThanOrEqual(paddedTopPt);
      }
      for (const bar of barRectangles(pdf)) {
        expect(bar.yPt + bar.heightPt).toBeLessThanOrEqual(paddedBottomPt);
      }
      expect(digitRuns.length).toBeGreaterThan(0);
      for (const run of digitRuns) {
        expect(run.baselinePt).toBeLessThanOrEqual(paddedBottomPt);
      }
    },
  );
});
