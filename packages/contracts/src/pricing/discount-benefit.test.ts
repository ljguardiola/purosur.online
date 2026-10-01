import {
  DISCOUNT_BUY_QTY_MIN,
  DISCOUNT_PAY_QTY_MIN,
  DISCOUNT_PERCENT_MAX,
  DISCOUNT_PERCENT_MIN,
  DISCOUNT_QTY_MAX,
} from "@purosur/domain";
import { describe, expect, it } from "vitest";
import {
  discountBuyQtySchema,
  discountPayQtySchema,
  discountPercentSchema,
} from "./discount-benefit.js";

describe("the benefit field schemas", () => {
  it("declare the range of a percentage", () => {
    expect([discountPercentSchema.minValue, discountPercentSchema.maxValue]).toEqual([
      DISCOUNT_PERCENT_MIN,
      DISCOUNT_PERCENT_MAX,
    ]);
  });

  it("declare the range of the quantity to take", () => {
    expect([discountBuyQtySchema.minValue, discountBuyQtySchema.maxValue]).toEqual([
      DISCOUNT_BUY_QTY_MIN,
      DISCOUNT_QTY_MAX,
    ]);
  });

  it("declare the range of the quantity to pay for", () => {
    expect([discountPayQtySchema.minValue, discountPayQtySchema.maxValue]).toEqual([
      DISCOUNT_PAY_QTY_MIN,
      DISCOUNT_QTY_MAX,
    ]);
  });

  it.each([
    [discountPercentSchema, DISCOUNT_PERCENT_MIN - 1],
    [discountPercentSchema, DISCOUNT_PERCENT_MAX + 1],
    [discountPercentSchema, 1.5],
    [discountBuyQtySchema, DISCOUNT_BUY_QTY_MIN - 1],
    [discountBuyQtySchema, DISCOUNT_QTY_MAX + 1],
    [discountBuyQtySchema, 2.5],
    [discountPayQtySchema, DISCOUNT_PAY_QTY_MIN - 1],
    [discountPayQtySchema, DISCOUNT_QTY_MAX + 1],
    [discountPayQtySchema, 1.5],
    [discountPayQtySchema, Number.NaN],
  ])("refuse a value outside the range or not whole", (schema, value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });
});
