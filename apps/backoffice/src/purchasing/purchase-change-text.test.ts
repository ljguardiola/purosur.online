import { describe, expect, it } from "vitest";
import { purchaseChangeMoment, purchaseChangeRows } from "./purchase-change-text";
import {
  compraDeMielCorregida,
  headerCorrection,
  lineExpiryCorrection,
  linesAdded,
} from "./test-support/purchase-changes";

describe("purchaseChangeRows of a header correction", () => {
  it("names each corrected field with its previous and new value", () => {
    expect(purchaseChangeRows(headerCorrection.change, compraDeMielCorregida)).toEqual([
      { label: "Fecha de compra", value: "14/09/2026 → 13/09/2026" },
      { label: "Tipo de comprobante", value: "Factura B → Remito" },
      { label: "Número de comprobante", value: "0001-00001234 → 0001-00001243" },
      { label: "Nota", value: "Sin nota → Llegó a la mañana" },
    ]);
  });

  it("writes a receipt that was cleared as without number", () => {
    expect(
      purchaseChangeRows(
        {
          kind: "header",
          changes: [{ field: "receiptNumber", previous: "0001-00001234", next: null }],
        },
        compraDeMielCorregida,
      ),
    ).toEqual([{ label: "Número de comprobante", value: "0001-00001234 → Sin número" }]);
  });
});

describe("purchaseChangeRows of added lines", () => {
  it("names each added line's product, quantity and cost paid, found by its id in the purchase", () => {
    expect(purchaseChangeRows(linesAdded.change, compraDeMielCorregida)).toEqual([
      { label: "Producto agregado", value: "Avena arrollada · 10,000 kg · $ 1.800,00" },
    ]);
  });

  it("writes a line the purchase no longer shows as not available", () => {
    expect(purchaseChangeRows(linesAdded.change, { ...compraDeMielCorregida, lines: [] })).toEqual([
      { label: "Producto agregado", value: "Producto no disponible" },
    ]);
  });
});

describe("purchaseChangeRows of an expiry correction", () => {
  it("names the line's product with the previous and the new expiry", () => {
    expect(purchaseChangeRows(lineExpiryCorrection.change, compraDeMielCorregida)).toEqual([
      { label: "Vencimiento de Miel pura de abeja 1 kg", value: "31/01/2027 → Sin vencimiento" },
    ]);
  });

  it("writes an expiry that was set as a date", () => {
    expect(
      purchaseChangeRows(
        {
          kind: "line_expiry",
          lineId: lineExpiryCorrection.change.lineId,
          previous: null,
          next: "2027-11-10",
        },
        compraDeMielCorregida,
      ),
    ).toEqual([
      { label: "Vencimiento de Miel pura de abeja 1 kg", value: "Sin vencimiento → 10/11/2027" },
    ]);
  });
});

describe("purchaseChangeMoment", () => {
  it("writes the day and time of the correction in the store's time zone", () => {
    expect(purchaseChangeMoment("2026-09-15T14:05:00.000Z")).toBe("15/09/2026 · 11:05");
  });
});
