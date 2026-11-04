import { ARGENTINA_TIME_ZONE } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { purchaseOrderDetailSchema } from "./purchase-order-detail.js";

const priced = {
  product: {
    id: "p-1",
    name: "Yerba",
    brandName: "Piragüé",
    netContent: { quantity: 500, unit: "G" },
    saleUnit: "UNIT",
  },
  packages: 3,
  quantityPerPackage: 12_000,
  expectedPackagePriceCents: 1_500_000,
  expectedTotalCents: 4_500_000,
  supplierItem: { code: "YER-500", description: "Yerba mate 500 g x12" },
  receivedQuantity: 12_000,
  outstandingQuantity: 24_000,
};
const unpriced = {
  product: { id: "p-2", name: "Harina", brandName: null, netContent: null, saleUnit: "KG" },
  packages: 1,
  quantityPerPackage: 25_000,
  expectedPackagePriceCents: null,
  expectedTotalCents: null,
  supplierItem: null,
  receivedQuantity: 0,
  outstandingQuantity: 25_000,
};
const receipt = {
  id: "receipt-1",
  receivedAt: "2026-03-12T15:00:00.000Z",
  purchaseId: "purchase-1",
  lines: [
    {
      productId: "p-1",
      receivedQuantity: 12_000,
      missingQuantity: 24_000,
      priceDifferenceCents: -50,
    },
    { productId: "p-2", receivedQuantity: 0, missingQuantity: 25_000, priceDifferenceCents: null },
  ],
};
const detail = {
  id: "order-1",
  supplier: { id: "s-1", name: "Distribuidora Sur" },
  state: "DRAFT",
  createdAt: "2026-03-10T15:00:00.000Z",
  lines: [priced, unpriced],
  expectedTotalCents: 4_500_000,
  hasUnpricedLine: true,
  editable: true,
  shareable: true,
  documentShareable: true,
  cancellable: true,
  receivable: false,
  receipts: [],
};

describe("purchaseOrderDetailSchema", () => {
  it("accepts an order with a line that has an expected price and one that has none", () => {
    expect(purchaseOrderDetailSchema.safeParse(detail).data).toEqual(detail);
  });

  it.each(["DRAFT", "SENT", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"])(
    "accepts the state %s",
    (state) => {
      expect(purchaseOrderDetailSchema.safeParse({ ...detail, state }).success).toBe(true);
    },
  );

  it("accepts a supplier item without a code", () => {
    const line = { ...priced, supplierItem: { code: null, description: "Yerba mate" } };
    expect(purchaseOrderDetailSchema.safeParse({ ...detail, lines: [line] }).success).toBe(true);
  });

  it("rejects a supplier item without its description or with a code that is not text", () => {
    for (const supplierItem of [{ code: "YER-500" }, { code: 7, description: "Yerba mate" }]) {
      expect(
        purchaseOrderDetailSchema.safeParse({ ...detail, lines: [{ ...priced, supplierItem }] })
          .success,
      ).toBe(false);
    }
  });

  it("rejects a line without the supplier item field", () => {
    const { supplierItem: _supplierItem, ...without } = priced;
    expect(purchaseOrderDetailSchema.safeParse({ ...detail, lines: [without] }).success).toBe(
      false,
    );
  });

  it("rejects an unknown state and a fractional price", () => {
    expect(purchaseOrderDetailSchema.safeParse({ ...detail, state: "SHIPPED" }).success).toBe(
      false,
    );
    expect(
      purchaseOrderDetailSchema.safeParse({
        ...detail,
        lines: [{ ...priced, expectedPackagePriceCents: 1.5 }],
      }).success,
    ).toBe(false);
  });

  it("rejects a line without the expected price field", () => {
    const { expectedPackagePriceCents: _price, ...withoutPrice } = priced;
    expect(purchaseOrderDetailSchema.safeParse({ ...detail, lines: [withoutPrice] }).success).toBe(
      false,
    );
  });

  it.each([
    "expectedTotalCents",
    "hasUnpricedLine",
    "editable",
    "shareable",
    "documentShareable",
    "cancellable",
    "receivable",
    "receipts",
  ])("rejects an order without %s", (field) => {
    const { [field]: _omitted, ...without } = detail as Record<string, unknown>;
    expect(purchaseOrderDetailSchema.safeParse(without).success).toBe(false);
  });

  it("rejects a line without its expected total", () => {
    const { expectedTotalCents: _total, ...withoutTotal } = priced;
    expect(purchaseOrderDetailSchema.safeParse({ ...detail, lines: [withoutTotal] }).success).toBe(
      false,
    );
  });
});

describe("purchaseOrderDetailSchema, receiving", () => {
  it("accepts an order received in part with its receipts, a line's price difference being absent when it has no list price", () => {
    const received = {
      ...detail,
      state: "PARTIALLY_RECEIVED",
      receivable: true,
      receipts: [receipt],
    };

    expect(purchaseOrderDetailSchema.safeParse(received).data).toEqual(received);
  });

  it.each(["receivedQuantity", "outstandingQuantity"])("rejects a line without %s", (field) => {
    const { [field]: _omitted, ...without } = priced as Record<string, unknown>;
    expect(purchaseOrderDetailSchema.safeParse({ ...detail, lines: [without] }).success).toBe(
      false,
    );
  });

  it.each([
    ["a receipt without its purchase", { ...receipt, purchaseId: undefined }],
    ["a receipt date that is not an instant", { ...receipt, receivedAt: "yesterday" }],
    [
      "a receipt line without its missing quantity",
      {
        ...receipt,
        lines: [{ productId: "p-1", receivedQuantity: 1, priceDifferenceCents: null }],
      },
    ],
    [
      "a receipt line with a fractional price difference",
      {
        ...receipt,
        lines: [
          { productId: "p-1", receivedQuantity: 1, missingQuantity: 0, priceDifferenceCents: 0.5 },
        ],
      },
    ],
  ])("rejects %s", (_name, badReceipt) => {
    expect(purchaseOrderDetailSchema.safeParse({ ...detail, receipts: [badReceipt] }).success).toBe(
      false,
    );
  });

  it("declares the zone a receipt's instant is shown in", () => {
    expect(purchaseOrderDetailSchema.shape.receipts.element.shape.receivedAt.meta()).toEqual({
      timeZone: ARGENTINA_TIME_ZONE,
    });
  });
});

describe("purchaseOrderDetailSchema, declared time zone", () => {
  it("declares the zone the creation instant is shown in", () => {
    expect(purchaseOrderDetailSchema.shape.createdAt.meta()).toEqual({
      timeZone: ARGENTINA_TIME_ZONE,
    });
  });
});
