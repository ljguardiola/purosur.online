import { describe, expect, it } from "vitest";
import { purchaseChangeMoment, purchaseChangeRows } from "./purchase-change-text";
import {
  compraDeMielCorregida,
  headerCorrection,
  LINEA_DE_MIEL_ID,
  lineCostCorrection,
  lineExpiryCorrection,
  lineExpirySplitCorrection,
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
          lineId: LINEA_DE_MIEL_ID,
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

describe("purchaseChangeRows of an expiry split", () => {
  it("names the units moved and the product with the previous and the new expiry date", () => {
    expect(purchaseChangeRows(lineExpirySplitCorrection.change, compraDeMielCorregida)).toEqual([
      {
        label: "Vencimiento de 1 u de Miel pura de abeja 1 kg",
        value: "31/01/2027 → 10/11/2027",
      },
    ]);
  });

  it("writes the quantity of a product sold by weight in kilos", () => {
    const line = compraDeMielCorregida.lines[1];
    expect(
      line &&
        purchaseChangeRows(
          {
            kind: "line_expiry_split",
            lineId: line.id,
            quantity: 2_500,
            previous: null,
            next: "2027-11-10",
          },
          compraDeMielCorregida,
        ),
    ).toEqual([
      {
        label: "Vencimiento de 2,500 kg de Avena arrollada",
        value: "Sin vencimiento → 10/11/2027",
      },
    ]);
  });

  it("writes a line the purchase no longer shows as not available", () => {
    expect(
      purchaseChangeRows(lineExpirySplitCorrection.change, { ...compraDeMielCorregida, lines: [] }),
    ).toEqual([
      { label: "Vencimiento de Producto no disponible", value: "31/01/2027 → 10/11/2027" },
    ]);
  });
});

describe("purchaseChangeRows of a cost correction", () => {
  it("names the line's product with the previous and the new cost paid", () => {
    expect(purchaseChangeRows(lineCostCorrection.change, compraDeMielCorregida)).toEqual([
      { label: "Costo de Miel pura de abeja 1 kg", value: "$ 7.200,00 → $ 6.800,00" },
    ]);
  });

  it("writes a line the purchase no longer shows as not available", () => {
    expect(
      purchaseChangeRows(lineCostCorrection.change, { ...compraDeMielCorregida, lines: [] }),
    ).toEqual([{ label: "Costo de Producto no disponible", value: "$ 7.200,00 → $ 6.800,00" }]);
  });
});

describe("purchaseChangeMoment", () => {
  it("writes the day and time of the correction in the store's time zone", () => {
    expect(purchaseChangeMoment("2026-09-15T14:05:00.000Z")).toBe("15/09/2026 · 11:05");
  });
});
