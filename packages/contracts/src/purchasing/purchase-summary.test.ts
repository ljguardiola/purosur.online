import { describe, expect, it } from "vitest";
import { purchaseListSchema, purchaseSummarySchema } from "./purchase-summary.js";

const packagedLine = {
  id: "line-1",
  product: { id: "p-1", name: "Yerba", saleUnit: "UNIT" },
  packaging: { id: "k-1", name: "Caja x 12" },
  packages: 2,
  quantity: 24_000,
  costPaidCents: 1_450_050,
  quantityPerPackage: 12_000,
  unitCostCents: 120_838,
  lotNumber: "L-17",
  expiresOn: "2027-01-31",
};
const quantityLine = {
  id: "line-2",
  product: { id: "p-2", name: "Harina", saleUnit: "KG" },
  packaging: null,
  packages: null,
  quantity: 2_500,
  costPaidCents: 90_000,
  quantityPerPackage: 1_000,
  unitCostCents: 90_000,
  lotNumber: null,
  expiresOn: null,
};
const purchase = {
  id: "purchase-1",
  purchasedOn: "2026-03-09",
  supplier: { id: "s-1", name: "Distribuidora Sur" },
  receiptType: "factura_b",
  receiptNumber: "0001-00001234",
  note: "Entrega de la tarde",
  recordedAt: "2026-03-10T15:00:00.000Z",
  lines: [packagedLine, quantityLine],
};

describe("purchaseSummarySchema", () => {
  it("accepts a purchase with a line loaded by packaging and one loaded by quantity", () => {
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
    "packaging",
    "packages",
    "quantity",
    "costPaidCents",
    "quantityPerPackage",
    "unitCostCents",
    "lotNumber",
    "expiresOn",
  ])("requires a line's %s", (field) => {
    const { [field as keyof typeof packagedLine]: _omitted, ...line } = packagedLine;

    expect(purchaseSummarySchema.safeParse({ ...purchase, lines: [line] }).success).toBe(false);
  });

  it.each([
    ["id", 1],
    ["product", { id: "p-1", name: "Yerba", saleUnit: "LITER" }],
    ["packaging", { id: "k-1" }],
    ["packages", 1.5],
    ["quantity", 1.5],
    ["costPaidCents", "100"],
    ["quantityPerPackage", 1.5],
    ["unitCostCents", 1.5],
    ["lotNumber", 5],
    ["expiresOn", 5],
  ])("refuses a line's %s as %j", (field, value) => {
    expect(
      purchaseSummarySchema.safeParse({
        ...purchase,
        lines: [{ ...packagedLine, [field]: value }],
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
