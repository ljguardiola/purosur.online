import { describe, expect, it } from "vitest";
import { purchaseChangeMoment, purchaseChangeRows } from "./purchase-change-text";
import {
  ALMOND_OIL_PRODUCT,
  HONEY_PRODUCT,
  headerCorrection,
  LINEA_DE_MIEL_ID,
  lineCostCorrection,
  lineExpiryCorrection,
  lineExpirySplitCorrection,
  lineProductCorrection,
  lineQuantityCorrection,
  lineRemoved,
  lineRemovedWithoutPackages,
  linesAdded,
  OATS_PRODUCT,
} from "./test-support/purchase-changes";

describe("purchaseChangeRows of a header correction", () => {
  it("names each corrected field with its previous and new value", () => {
    expect(purchaseChangeRows(headerCorrection.change)).toEqual([
      { label: "Fecha de compra", value: "14/09/2026 → 13/09/2026" },
      { label: "Tipo de comprobante", value: "Factura B → Remito" },
      { label: "Número de comprobante", value: "0001-00001234 → 0001-00001243" },
      { label: "Nota", value: "Sin nota → Llegó a la mañana" },
    ]);
  });

  it("writes a receipt that was cleared as without number", () => {
    expect(
      purchaseChangeRows({
        kind: "header",
        changes: [{ field: "receiptNumber", previous: "0001-00001234", next: null }],
      }),
    ).toEqual([{ label: "Número de comprobante", value: "0001-00001234 → Sin número" }]);
  });
});

describe("purchaseChangeRows of added lines", () => {
  it("names each added line's product, quantity and cost paid", () => {
    expect(purchaseChangeRows(linesAdded.change)).toEqual([
      { label: "Producto agregado", value: "Avena arrollada · 10,000 kg · $ 1.800,00" },
    ]);
  });
});

describe("purchaseChangeRows of an expiry correction", () => {
  it("names the line's product with the previous and the new expiry", () => {
    expect(purchaseChangeRows(lineExpiryCorrection.change)).toEqual([
      { label: "Vencimiento de Miel pura de abeja 1 kg", value: "31/01/2027 → Sin vencimiento" },
    ]);
  });

  it("writes an expiry that was set as a date", () => {
    expect(
      purchaseChangeRows({
        kind: "line_expiry",
        lineId: LINEA_DE_MIEL_ID,
        product: HONEY_PRODUCT,
        previous: null,
        next: "2027-11-10",
      }),
    ).toEqual([
      { label: "Vencimiento de Miel pura de abeja 1 kg", value: "Sin vencimiento → 10/11/2027" },
    ]);
  });
});

describe("purchaseChangeRows of an expiry split", () => {
  it("names the units moved and the product with the previous and the new expiry date", () => {
    expect(purchaseChangeRows(lineExpirySplitCorrection.change)).toEqual([
      {
        label: "Vencimiento de 1 u de Miel pura de abeja 1 kg",
        value: "31/01/2027 → 10/11/2027",
      },
    ]);
  });

  it("writes the quantity of a product sold by weight in kilos", () => {
    expect(
      purchaseChangeRows({
        kind: "line_expiry_split",
        lineId: LINEA_DE_MIEL_ID,
        product: OATS_PRODUCT,
        quantity: 2_500,
        previous: null,
        next: "2027-11-10",
      }),
    ).toEqual([
      {
        label: "Vencimiento de 2,500 kg de Avena arrollada",
        value: "Sin vencimiento → 10/11/2027",
      },
    ]);
  });
});

describe("purchaseChangeRows of a cost correction", () => {
  it("names the line's product with the previous and the new cost paid", () => {
    expect(purchaseChangeRows(lineCostCorrection.change)).toEqual([
      { label: "Costo de Miel pura de abeja 1 kg", value: "$ 7.200,00 → $ 6.800,00" },
    ]);
  });

  it("names the product the change carries, the one the line had when it was made", () => {
    expect(
      purchaseChangeRows({
        kind: "line_cost",
        lineId: LINEA_DE_MIEL_ID,
        product: ALMOND_OIL_PRODUCT,
        previous: 7_200_00,
        next: 6_800_00,
      }),
    ).toEqual([
      { label: "Costo de Aceite de Almendras Vitora 30 ml", value: "$ 7.200,00 → $ 6.800,00" },
    ]);
  });
});

describe("purchaseChangeRows of a quantity correction", () => {
  it("names the line's product with the packages and the quantity before and after", () => {
    expect(purchaseChangeRows(lineQuantityCorrection.change)).toEqual([
      {
        label: "Cantidad de Miel pura de abeja 1 kg",
        value: "2 paquetes (24 u) → 3 paquetes (36 u)",
      },
    ]);
  });

  it("writes a single package in the singular", () => {
    expect(
      purchaseChangeRows({
        kind: "line_quantity",
        lineId: LINEA_DE_MIEL_ID,
        product: HONEY_PRODUCT,
        previous: { quantity: 12_000, packages: 1 },
        next: { quantity: 24_000, packages: 2 },
      }),
    ).toEqual([
      {
        label: "Cantidad de Miel pura de abeja 1 kg",
        value: "1 paquete (12 u) → 2 paquetes (24 u)",
      },
    ]);
  });

  it("writes the quantity of a line loaded by quantity of a product sold by weight in kilos", () => {
    expect(
      purchaseChangeRows({
        kind: "line_quantity",
        lineId: LINEA_DE_MIEL_ID,
        product: OATS_PRODUCT,
        previous: { quantity: 10_000, packages: null },
        next: { quantity: 8_500, packages: null },
      }),
    ).toEqual([{ label: "Cantidad de Avena arrollada", value: "10,000 kg → 8,500 kg" }]);
  });
});

describe("purchaseChangeRows of a product correction", () => {
  it("names the previous and the new product", () => {
    expect(purchaseChangeRows(lineProductCorrection.change)).toEqual([
      {
        label: "Producto",
        value: "Miel pura de abeja 1 kg → Aceite de Almendras Vitora 30 ml",
      },
    ]);
  });
});

describe("purchaseChangeRows of a removed line", () => {
  it("names the product, the quantity as the line was loaded and the cost paid", () => {
    expect(purchaseChangeRows(lineRemoved.change)).toEqual([
      {
        label: "Producto quitado",
        value: "Miel pura de abeja 1 kg · 2 paquetes (24 u) · $ 3.600,00",
      },
    ]);
  });

  it("writes the quantity of a line loaded by quantity without packages", () => {
    expect(purchaseChangeRows(lineRemovedWithoutPackages.change)).toEqual([
      {
        label: "Producto quitado",
        value: "Miel pura de abeja 1 kg · 24 u · $ 3.600,00",
      },
    ]);
  });
});

describe("purchaseChangeMoment", () => {
  it("writes the day and time of the correction in the store's time zone", () => {
    expect(purchaseChangeMoment("2026-09-15T14:05:00.000Z")).toBe("15/09/2026 · 11:05");
  });
});
