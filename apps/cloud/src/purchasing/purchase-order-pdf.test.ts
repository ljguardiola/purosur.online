import { describe, expect, it } from "vitest";
import { renderedTextRuns } from "../platform/test-support/rendered-pdf.js";
import { purchaseOrderDocument } from "./purchase-order-document.js";
import { renderPurchaseOrderPdf } from "./purchase-order-pdf.js";
import { documentSource } from "./test-support/purchase-order-document-fixtures.js";

const CREATED_AT = new Date("2026-01-05T12:00:00.000Z");

function pageCount(pdf: Buffer): number {
  return pdf.toString("latin1").match(/\/Type \/Page(?![a-z])/g)?.length ?? 0;
}

describe("renderPurchaseOrderPdf", () => {
  it("renders a PDF created at the time it is given", async () => {
    const pdf = await renderPurchaseOrderPdf(purchaseOrderDocument(documentSource()), CREATED_AT);

    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.toString("latin1")).toContain("(D:20260105120000Z)");
    expect(pageCount(pdf)).toBe(1);
  });

  it("renders names far longer than a line, and characters outside Latin-1 as real glyphs of an embedded bold font", async () => {
    const [line] = documentSource().lines;
    if (!line) {
      throw new Error("the fixture has a line");
    }
    const longName = `Yerba mate con palo ${"muy ".repeat(80)}ő ≈ Ω`;
    const source = documentSource({
      supplier: { name: `Distribuidora ${"del Sur ".repeat(30)}` },
      lines: [
        {
          ...line,
          product: { ...line.product, name: longName },
          supplierItem: { code: "C".repeat(120), description: longName },
        },
      ],
    });

    const pdf = await renderPurchaseOrderPdf(purchaseOrderDocument(source), CREATED_AT);
    const runs = renderedTextRuns(pdf);

    expect(runs.map((run) => run.text).join("")).toContain("ő ≈ Ω");
    for (const run of runs) {
      expect(run.font.embedded).toBe(true);
      expect(run.font.baseFont).toMatch(/\+LiberationSans-Bold$/);
      expect(run.text).not.toContain("�");
    }
  });

  it("continues on more pages when the lines do not fit one", async () => {
    const [line] = documentSource().lines;
    if (!line) {
      throw new Error("the fixture has a line");
    }
    const lines = Array.from({ length: 120 }, (_, index) => ({
      ...line,
      product: { ...line.product, name: `Producto ${index + 1}` },
    }));

    const pdf = await renderPurchaseOrderPdf(
      purchaseOrderDocument(documentSource({ lines })),
      CREATED_AT,
    );

    expect(pageCount(pdf)).toBeGreaterThan(1);
  });
});
