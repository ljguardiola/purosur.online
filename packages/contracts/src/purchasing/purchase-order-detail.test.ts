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
};
const unpriced = {
  product: { id: "p-2", name: "Harina", brandName: null, netContent: null, saleUnit: "KG" },
  packages: 1,
  quantityPerPackage: 25_000,
  expectedPackagePriceCents: null,
  expectedTotalCents: null,
  supplierItem: null,
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
  cancellable: true,
};

describe("purchaseOrderDetailSchema", () => {
  it("accepts an order with a line that has an expected price and one that has none", () => {
    expect(purchaseOrderDetailSchema.safeParse(detail).data).toEqual(detail);
  });

  it.each(["DRAFT", "SENT", "CANCELLED"])("accepts the state %s", (state) => {
    expect(purchaseOrderDetailSchema.safeParse({ ...detail, state }).success).toBe(true);
  });

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

  it.each(["expectedTotalCents", "hasUnpricedLine", "editable", "shareable", "cancellable"])(
    "rejects an order without %s",
    (field) => {
      const { [field]: _omitted, ...without } = detail as Record<string, unknown>;
      expect(purchaseOrderDetailSchema.safeParse(without).success).toBe(false);
    },
  );

  it("rejects a line without its expected total", () => {
    const { expectedTotalCents: _total, ...withoutTotal } = priced;
    expect(purchaseOrderDetailSchema.safeParse({ ...detail, lines: [withoutTotal] }).success).toBe(
      false,
    );
  });
});

describe("purchaseOrderDetailSchema, declared time zone", () => {
  it("declares the zone the creation instant is shown in", () => {
    expect(purchaseOrderDetailSchema.shape.createdAt.meta()).toEqual({
      timeZone: ARGENTINA_TIME_ZONE,
    });
  });
});
