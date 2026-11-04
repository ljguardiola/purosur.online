import { describe, expect, it } from "vitest";
import {
  purchaseOrderReceiptBodySchema,
  purchaseOrderReceiptDraftSchema,
  purchaseOrderReceiptSchema,
} from "./purchase-order-receipt.js";

const PRODUCT_ID = "22222222-2222-2222-2222-222222222222";

const receipt = {
  purchasedOn: "2026-03-09",
  receiptType: "factura_b",
  receiptNumber: "0001-00001234",
  note: null,
  lines: [
    {
      loadedBy: "packages",
      productId: PRODUCT_ID,
      packages: 2,
      quantityPerPackage: 12_000,
      costPaidCents: 3_300,
      expiresOn: null,
    },
  ],
};

describe("purchaseOrderReceiptBodySchema", () => {
  it("accepts the purchase an order is received into, which names no supplier", () => {
    expect(purchaseOrderReceiptBodySchema.safeParse(receipt).data).toEqual(receipt);
  });

  it("leaves out a supplier the body names, the order's own being the one", () => {
    const parsed = purchaseOrderReceiptBodySchema.parse({
      ...receipt,
      supplierId: "11111111-1111-1111-1111-111111111111",
    });

    expect(parsed).not.toHaveProperty("supplierId");
  });

  it("holds the receipt to the rules of any purchase", () => {
    expect(purchaseOrderReceiptBodySchema.safeParse({ ...receipt, lines: [] }).success).toBe(false);
    expect(
      purchaseOrderReceiptBodySchema.safeParse({ ...receipt, receiptNumber: null }).success,
    ).toBe(false);
    expect(
      purchaseOrderReceiptBodySchema.safeParse({
        ...receipt,
        lines: [{ ...receipt.lines[0], costPaidCents: -1 }],
      }).success,
    ).toBe(false);
  });
});

describe("purchaseOrderReceiptSchema", () => {
  it.each(["PARTIALLY_RECEIVED", "RECEIVED"])("accepts an order left %s", (state) => {
    const body = { purchaseId: "purchase-1", state };
    expect(purchaseOrderReceiptSchema.safeParse(body).data).toEqual(body);
  });

  it.each(["SENT", "DRAFT", "CANCELLED"])("rejects an order left %s", (state) => {
    expect(purchaseOrderReceiptSchema.safeParse({ purchaseId: "purchase-1", state }).success).toBe(
      false,
    );
  });

  it("rejects a receipt without its purchase", () => {
    expect(purchaseOrderReceiptSchema.safeParse({ state: "RECEIVED" }).success).toBe(false);
  });
});

const product = {
  id: "p-1",
  name: "Yerba",
  brandName: "Piragüé",
  netContent: { quantity: 500, unit: "G" },
  saleUnit: "UNIT",
};

const draft = {
  supplier: { id: "s-1", name: "Distribuidora Sur" },
  lines: [
    {
      loadedBy: "packages",
      product,
      packages: 2,
      quantityPerPackage: 12_000,
      listCostPerPackageCents: 3_000,
    },
    { loadedBy: "quantity", product, quantity: 26_000, listCostPerSaleUnitCents: null },
  ],
};

describe("purchaseOrderReceiptDraftSchema", () => {
  it("accepts a line loaded by packages and one loaded by quantity, either without a list cost", () => {
    expect(purchaseOrderReceiptDraftSchema.safeParse(draft).data).toEqual(draft);
    expect(
      purchaseOrderReceiptDraftSchema.safeParse({
        ...draft,
        lines: [{ ...draft.lines[0], listCostPerPackageCents: null }],
      }).success,
    ).toBe(true);
  });

  it("accepts a draft without lines", () => {
    expect(purchaseOrderReceiptDraftSchema.safeParse({ ...draft, lines: [] }).success).toBe(true);
  });

  it.each([
    ["a line of an unknown way of loading", { ...draft.lines[0], loadedBy: "weight" }],
    ["a packages line without its packages", { ...draft.lines[0], packages: undefined }],
    [
      "a packages line without its list cost field",
      { ...draft.lines[0], listCostPerPackageCents: undefined },
    ],
    ["a quantity line without its quantity", { ...draft.lines[1], quantity: undefined }],
    [
      "a quantity line without its list cost field",
      { ...draft.lines[1], listCostPerSaleUnitCents: undefined },
    ],
    ["a line with a fractional list cost", { ...draft.lines[0], listCostPerPackageCents: 1.5 }],
    ["a line without its product", { ...draft.lines[0], product: undefined }],
  ])("rejects %s", (_name, line) => {
    expect(purchaseOrderReceiptDraftSchema.safeParse({ ...draft, lines: [line] }).success).toBe(
      false,
    );
  });

  it("rejects a draft without its supplier", () => {
    expect(purchaseOrderReceiptDraftSchema.safeParse({ lines: [] }).success).toBe(false);
  });
});
