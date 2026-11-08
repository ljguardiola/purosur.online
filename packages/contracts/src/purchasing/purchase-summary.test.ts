import { describe, expect, it } from "vitest";
import {
  purchaseListQuerySchema,
  purchaseListSchema,
  purchaseSummarySchema,
} from "./purchase-summary.js";

const packagesLine = {
  id: "line-1",
  product: {
    id: "p-1",
    name: "Yerba",
    brandName: "Piragüé",
    netContent: { quantity: 500, unit: "G" },
    saleUnit: "UNIT",
  },
  packages: 2,
  quantity: 24_000,
  costPaidCents: 1_450_050,
  quantityPerPackage: 12_000,
  unitCostCents: 120_838,
  lotName: "Compra 03/11/2026",
  expiresOn: "2027-01-31",
  remainingInLot: 18_000,
};
const quantityLine = {
  id: "line-2",
  product: { id: "p-2", name: "Harina", brandName: null, netContent: null, saleUnit: "KG" },
  packages: null,
  quantity: 2_500,
  costPaidCents: 90_000,
  quantityPerPackage: 1_000,
  unitCostCents: 90_000,
  lotName: "Compra 03/11/2026 · 2",
  expiresOn: null,
  remainingInLot: -500,
};
const purchase = {
  id: "purchase-1",
  purchasedOn: "2026-03-09",
  supplier: { id: "s-1", name: "Distribuidora Sur" },
  receiptType: "factura_b",
  receiptNumber: "0001-00001234",
  note: "Entrega de la tarde",
  recordedAt: "2026-03-10T15:00:00.000Z",
  lines: [packagesLine, quantityLine],
};

describe("purchaseSummarySchema", () => {
  it("accepts a purchase with a line loaded by packages and one loaded by quantity", () => {
    expect(purchaseSummarySchema.safeParse(purchase).data).toEqual(purchase);
  });

  it("accepts a purchase without a receipt or a note", () => {
    const bare = {
      ...purchase,
      receiptType: "sin_comprobante",
      receiptNumber: null,
      note: null,
    };
    expect(purchaseSummarySchema.safeParse(bare).data).toEqual(bare);
  });

  it("strips a packaging from a line", () => {
    const parsed = purchaseSummarySchema.safeParse({
      ...purchase,
      lines: [{ ...quantityLine, packaging: { id: "k-1", name: "Caja x 12" } }],
    });
    expect(parsed.data).toEqual({ ...purchase, lines: [quantityLine] });
  });

  it("strips keys it does not define", () => {
    const parsed = purchaseSummarySchema.safeParse({
      ...purchase,
      total: 1,
      supplier: { ...purchase.supplier, cuit: "x" },
      lines: [{ ...quantityLine, lotId: "x", product: { ...quantityLine.product, active: true } }],
    });
    expect(parsed.data).toEqual({ ...purchase, lines: [quantityLine] });
  });

  it.each([
    "id",
    "purchasedOn",
    "supplier",
    "receiptType",
    "receiptNumber",
    "note",
    "recordedAt",
    "lines",
  ])("requires %s", (field) => {
    const { [field as keyof typeof purchase]: _omitted, ...rest } = purchase;

    expect(purchaseSummarySchema.safeParse(rest).success).toBe(false);
  });

  it.each([
    ["id", 1],
    ["purchasedOn", 20_260_309],
    ["supplier", { id: "s-1" }],
    ["receiptType", "factura_a"],
    ["receiptNumber", 12],
    ["note", 5],
    ["recordedAt", "yesterday"],
    ["lines", {}],
  ])("refuses %s as %j", (field, value) => {
    expect(purchaseSummarySchema.safeParse({ ...purchase, [field]: value }).success).toBe(false);
  });

  it.each([
    "id",
    "product",
    "packages",
    "quantity",
    "costPaidCents",
    "quantityPerPackage",
    "unitCostCents",
    "lotName",
    "expiresOn",
  ])("requires a line's %s", (field) => {
    const { [field as keyof typeof packagesLine]: _omitted, ...line } = packagesLine;

    expect(purchaseSummarySchema.safeParse({ ...purchase, lines: [line] }).success).toBe(false);
  });

  it.each([
    ["id", 1],
    ["product", { ...packagesLine.product, saleUnit: "LITER" }],
    ["product", { ...packagesLine.product, brandName: undefined }],
    ["product", { ...packagesLine.product, netContent: undefined }],
    ["product", { ...packagesLine.product, netContent: { quantity: 500, unit: "BOX" } }],
    ["packages", 1.5],
    ["quantity", 1.5],
    ["costPaidCents", "100"],
    ["quantityPerPackage", 1.5],
    ["unitCostCents", 1.5],
    ["lotName", 5],
    ["lotName", null],
    ["expiresOn", 5],
  ])("refuses a line's %s as %j", (field, value) => {
    expect(
      purchaseSummarySchema.safeParse({
        ...purchase,
        lines: [{ ...packagesLine, [field]: value }],
      }).success,
    ).toBe(false);
  });
});

describe("purchaseListSchema", () => {
  it("accepts purchases, newest first as the cloud sends them, and none", () => {
    expect(purchaseListSchema.safeParse([purchase]).data).toEqual([purchase]);
    expect(purchaseListSchema.safeParse([]).data).toEqual([]);
  });

  it.each([undefined, null, {}, [{ ...purchase, id: 1 }]])("refuses %j as a list", (body) => {
    expect(purchaseListSchema.safeParse(body).success).toBe(false);
  });
});

describe("purchaseListQuerySchema", () => {
  const SUPPLIER_ID = "11111111-1111-4111-8111-111111111111";

  it("accepts no filter or a supplier's id, lowercased", () => {
    expect(purchaseListQuerySchema.parse({})).toEqual({});
    expect(purchaseListQuerySchema.parse({ supplierId: SUPPLIER_ID.toUpperCase() })).toEqual({
      supplierId: SUPPLIER_ID,
    });
  });

  it("refuses a supplier that is not a record id", () => {
    expect(purchaseListQuerySchema.safeParse({ supplierId: "x" }).success).toBe(false);

    expect(
      purchaseListQuerySchema.safeParse({ supplierId: "x" }).error?.issues[0]?.message,
    ).toBe("supplierId must be a supplier's id");
  });
});
