import { describe, expect, it } from "vitest";
import { linkablePurchaseListSchema } from "./linkable-purchase-summary.js";

const purchase = {
  id: "purchase-1",
  purchasedOn: "2026-03-09",
  supplier: { id: "s-1", name: "Distribuidora Sur" },
  receiptType: "factura_b",
  receiptNumber: "0001-00001234",
  valueCents: 600,
};

describe("linkablePurchaseListSchema", () => {
  it("accepts purchases with their supplier, receipt and value", () => {
    expect(linkablePurchaseListSchema.safeParse([purchase]).data).toEqual([purchase]);
  });

  it("accepts a purchase without a receipt", () => {
    const bare = { ...purchase, receiptType: "sin_comprobante", receiptNumber: null };
    expect(linkablePurchaseListSchema.safeParse([bare]).data).toEqual([bare]);
  });

  it("refuses a receipt type that does not exist and a fractional value", () => {
    expect(
      linkablePurchaseListSchema.safeParse([{ ...purchase, receiptType: "factura_a" }]).success,
    ).toBe(false);
    expect(linkablePurchaseListSchema.safeParse([{ ...purchase, valueCents: 1.5 }]).success).toBe(
      false,
    );
  });
});
