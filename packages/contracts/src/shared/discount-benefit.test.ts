import {
  DISCOUNT_BUY_QTY_MIN,
  DISCOUNT_PAY_QTY_MIN,
  DISCOUNT_PERCENT_MAX,
  DISCOUNT_PERCENT_MIN,
  DISCOUNT_QTY_MAX,
  isValidDiscountBuyQty,
  isValidDiscountPayQty,
  isValidDiscountPercent,
} from "@purosur/domain";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  discountBuyQtySchema,
  discountPayQtySchema,
  discountPercentSchema,
} from "./discount-benefit.js";

const anyNumber = fc.oneof(
  fc.integer(),
  fc.double({ noNaN: false }),
  fc.constantFrom(
    DISCOUNT_PERCENT_MIN - 1,
    DISCOUNT_PERCENT_MAX + 1,
    DISCOUNT_BUY_QTY_MIN - 1,
    DISCOUNT_PAY_QTY_MIN - 1,
    DISCOUNT_QTY_MAX,
    DISCOUNT_QTY_MAX + 1,
  ),
);

describe("the benefit field schemas", () => {
  it("declare the range of a percentage in their metadata", () => {
    expect(discountPercentSchema.meta()).toMatchObject({
      minValue: DISCOUNT_PERCENT_MIN,
      maxValue: DISCOUNT_PERCENT_MAX,
    });
  });

  it("declare the smallest quantity to take in their metadata", () => {
    expect(discountBuyQtySchema.meta()).toMatchObject({ minValue: DISCOUNT_BUY_QTY_MIN });
  });

  it("declare the smallest quantity to pay for in their metadata", () => {
    expect(discountPayQtySchema.meta()).toMatchObject({ minValue: DISCOUNT_PAY_QTY_MIN });
  });

  it.each([
    ["percent", discountPercentSchema, isValidDiscountPercent],
    ["buyQty", discountBuyQtySchema, isValidDiscountBuyQty],
    ["payQty", discountPayQtySchema, isValidDiscountPayQty],
  ])("accept a %s exactly when the domain does", (_field, schema, isValid) => {
    fc.assert(
      fc.property(anyNumber, (value) => schema.safeParse(value).success === isValid(value)),
    );
  });
});
