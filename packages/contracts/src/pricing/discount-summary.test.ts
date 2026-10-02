import { describe, expect, it } from "vitest";
import { discountListSchema, discountSummarySchema } from "./discount-summary.js";

const summary = {
  id: "discount-1",
  name: "Verano",
  benefit: { kind: "PERCENT_OFF", percent: 15 },
  target: { kind: "CATEGORY", id: "category-1", name: "Lácteos" },
  validFrom: "2026-12-01",
  validTo: "2027-02-28",
  weekdays: [6, 7],
  active: true,
  version: 2,
  status: "current",
};

describe("discountSummarySchema", () => {
  it("accepts a discount as the list returns it", () => {
    expect(discountSummarySchema.safeParse(summary).data).toEqual(summary);
  });

  it("accepts a buy-N-pay-M discount", () => {
    const buyNPayM = {
      ...summary,
      benefit: { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 },
      target: { kind: "PRODUCT", id: "product-1", name: "Alfajor" },
    };
    expect(discountSummarySchema.safeParse(buyNPayM).data).toEqual(buyNPayM);
  });

  it.each(["current", "scheduled", "ended", "deactivated"])("accepts the %s status", (status) => {
    expect(discountSummarySchema.safeParse({ ...summary, status }).data).toEqual({
      ...summary,
      status,
    });
  });

  it.each(["PRODUCT", "CATEGORY", "TAG"])("accepts a %s target", (kind) => {
    expect(
      discountSummarySchema.safeParse({ ...summary, target: { ...summary.target, kind } }).success,
    ).toBe(true);
  });

  it.each([
    ["a target without its name", { ...summary, target: { kind: "TAG", id: "tag-1" } }],
    ["an unknown target kind", { ...summary, target: { ...summary.target, kind: "BRAND" } }],
    ["an unknown benefit kind", { ...summary, benefit: { kind: "BUY_ONE", percent: 1 } }],
    [
      "a buy-N-pay-M benefit without its quantities",
      { ...summary, benefit: { kind: "BUY_N_PAY_M", percent: 1 } },
    ],
    ["a missing benefit", { ...summary, benefit: undefined }],
    ["a fractional version", { ...summary, version: 1.5 }],
    ["a weekday that is not a number", { ...summary, weekdays: ["1"] }],
    ["a missing active flag", { ...summary, active: undefined }],
    ["a missing name", { ...summary, name: undefined }],
    ["a missing validFrom", { ...summary, validFrom: undefined }],
    ["a missing validTo", { ...summary, validTo: undefined }],
    ["a missing id", { ...summary, id: undefined }],
    ["a missing status", { ...summary, status: undefined }],
    ["an unknown status", { ...summary, status: "expired" }],
  ])("rejects %s", (_, body) => {
    expect(discountSummarySchema.safeParse(body).success).toBe(false);
  });
});

describe("discountListSchema", () => {
  it("accepts a list of discounts", () => {
    expect(discountListSchema.safeParse({ discounts: [summary, summary] }).data).toEqual({
      discounts: [summary, summary],
    });
  });

  it("accepts an empty list", () => {
    expect(discountListSchema.safeParse({ discounts: [] }).success).toBe(true);
  });

  it.each([{}, { discounts: null }, { discounts: [{}] }])("rejects %j", (body) => {
    expect(discountListSchema.safeParse(body).success).toBe(false);
  });
});
