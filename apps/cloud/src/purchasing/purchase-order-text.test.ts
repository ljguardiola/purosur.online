import { describe, expect, it } from "vitest";
import { purchaseOrderDocument } from "./purchase-order-document.js";
import { renderPurchaseOrderText } from "./purchase-order-text.js";
import { documentSource } from "./test-support/purchase-order-document-fixtures.js";

describe("renderPurchaseOrderText", () => {
  it("writes the title, the day and one numbered block per line", () => {
    const text = renderPurchaseOrderText(purchaseOrderDocument(documentSource()));

    expect(text).toBe(
      [
        "Pedido a Distribuidora Sur",
        "Fecha: 10/03/2026",
        "",
        "1. Yerba Piragüé 500 g",
        "   3 paquetes de 12 u",
        "   Artículo del proveedor: YER-500 - Yerba mate 500 g x12",
        "",
        "2. Harina",
        "   1 paquete de 25 kg",
      ].join("\n"),
    );
  });

  it("writes an order of a single line without a trailing blank line", () => {
    const [line] = documentSource().lines;
    if (!line) {
      throw new Error("the fixture has a line");
    }

    const text = renderPurchaseOrderText(
      purchaseOrderDocument(documentSource({ lines: [{ ...line, supplierItem: null }] })),
    );

    expect(text).toBe(
      [
        "Pedido a Distribuidora Sur",
        "Fecha: 10/03/2026",
        "",
        "1. Yerba Piragüé 500 g",
        "   3 paquetes de 12 u",
      ].join("\n"),
    );
  });

  it("writes no price", () => {
    const text = renderPurchaseOrderText(purchaseOrderDocument(documentSource()));

    expect(text).not.toMatch(/\$|precio/i);
  });
});
