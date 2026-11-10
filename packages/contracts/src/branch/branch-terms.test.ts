import { describe, expect, it } from "vitest";
import {
  goodConditionReturnDaysBodySchema,
  supplierPriceListDailyCapBodySchema,
} from "./branch-terms.js";

describe("goodConditionReturnDaysBodySchema", () => {
  it("accepts the days a good-condition return stays open", () => {
    expect(
      goodConditionReturnDaysBodySchema.safeParse({ good_condition_return_days: 15 }).data,
    ).toEqual({
      good_condition_return_days: 15,
    });
  });

  it.each([undefined, 1.5, "15"])("rejects %s days", (days) => {
    expect(
      goodConditionReturnDaysBodySchema.safeParse({ good_condition_return_days: days }).success,
    ).toBe(false);
  });

  it("leaves out any other branch setting", () => {
    expect(
      goodConditionReturnDaysBodySchema.safeParse({
        good_condition_return_days: 15,
        address: "Av. Belgrano 1450, CABA",
      }).data,
    ).toEqual({ good_condition_return_days: 15 });
  });
});

describe("supplierPriceListDailyCapBodySchema", () => {
  it("accepts the supplier price list daily extraction cap", () => {
    expect(
      supplierPriceListDailyCapBodySchema.safeParse({
        supplier_price_list_daily_extraction_cap: 10,
      }).data,
    ).toEqual({ supplier_price_list_daily_extraction_cap: 10 });
  });

  it.each([undefined, 1.5, "10"])("rejects a cap of %s", (cap) => {
    expect(
      supplierPriceListDailyCapBodySchema.safeParse({
        supplier_price_list_daily_extraction_cap: cap,
      }).success,
    ).toBe(false);
  });

  it("leaves out any other branch setting", () => {
    expect(
      supplierPriceListDailyCapBodySchema.safeParse({
        supplier_price_list_daily_extraction_cap: 10,
        good_condition_return_days: 15,
      }).data,
    ).toEqual({ supplier_price_list_daily_extraction_cap: 10 });
  });
});
