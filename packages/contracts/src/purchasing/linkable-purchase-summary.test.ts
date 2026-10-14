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
  it("accepts purchases with their supplier, receipt and value, and today's day", () => {
    const list = { purchases: [purchase], today: "2026-03-10" };
    expect(linkablePurchaseListSchema.safeParse(list).data).toEqual(list);
  });

  it.each(["2026-02-30", "10/03/2026", "", 20260310])("refuses %j as today", (today) => {
    expect(linkablePurchaseListSchema.safeParse({ purchases: [], today }).success).toBe(false);
  });

  it("refuses a list without today", () => {
    expect(linkablePurchaseListSchema.safeParse({ purchases: [purchase] }).success).toBe(false);
  });

  it("accepts a purchase without a receipt", () => {
    const bare = { ...purchase, receiptType: "sin_comprobante", receiptNumber: null };
    const list = { purchases: [bare], today: "2026-03-10" };
    expect(linkablePurchaseListSchema.safeParse(list).data).toEqual(list);
  });

  it("refuses a receipt type that does not exist and a fractional value", () => {
    const today = "2026-03-10";
    expect(
      linkablePurchaseListSchema.safeParse({
        purchases: [{ ...purchase, receiptType: "factura_a" }],
        today,
      }).success,
    ).toBe(false);
    expect(
      linkablePurchaseListSchema.safeParse({
        purchases: [{ ...purchase, valueCents: 1.5 }],
        today,
      }).success,
    ).toBe(false);
  });
});
