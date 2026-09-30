import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  DISCOUNT_PERCENT_MAX,
  DISCOUNT_PERCENT_MIN,
  isValidDiscountPercent,
} from "./discount-percent.js";

describe("discount percent bounds", () => {
  it("runs from 1 to 99", () => {
    expect(DISCOUNT_PERCENT_MIN).toBe(1);
    expect(DISCOUNT_PERCENT_MAX).toBe(99);
  });
});

describe("isValidDiscountPercent", () => {
  it.each([1, 15, 50, 99])("accepts the whole number %j", (percent) => {
    expect(isValidDiscountPercent(percent)).toBe(true);
  });

  it.each([
    0,
    100,
    -5,
    15.5,
    0.5,
    99.5,
    100.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])("rejects %j", (percent) => {
    expect(isValidDiscountPercent(percent)).toBe(false);
  });

  it("accepts exactly the integers from 1 to 99", () => {
    fc.assert(
      fc.property(fc.integer({ min: -1000, max: 1000 }), (percent) => {
        expect(isValidDiscountPercent(percent)).toBe(percent >= 1 && percent <= 99);
      }),
    );
  });

  it("rejects every non-integer, including those between 1 and 99", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 200, noNaN: true }).filter((value) => !Number.isInteger(value)),
        (percent) => {
          expect(isValidDiscountPercent(percent)).toBe(false);
        },
      ),
    );
  });
});
