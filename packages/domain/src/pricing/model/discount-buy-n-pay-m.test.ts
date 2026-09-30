import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  DISCOUNT_BUY_QTY_MIN,
  DISCOUNT_PAY_QTY_MIN,
  isBuyNPayMSaleUnit,
  isValidDiscountBuyNPayM,
  isValidDiscountBuyQty,
  isValidDiscountPayQty,
} from "./discount-buy-n-pay-m.js";

const NOT_WHOLE = [2.5, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];

describe("buy-N-pay-M quantity bounds", () => {
  it("buys at least 2 and pays at least 1", () => {
    expect(DISCOUNT_BUY_QTY_MIN).toBe(2);
    expect(DISCOUNT_PAY_QTY_MIN).toBe(1);
  });
});

describe("isValidDiscountBuyQty", () => {
  it.each([2, 3, 12, 1000])("accepts the whole number %j", (buyQty) => {
    expect(isValidDiscountBuyQty(buyQty)).toBe(true);
  });

  it.each([1, 0, -3, ...NOT_WHOLE])("rejects %j", (buyQty) => {
    expect(isValidDiscountBuyQty(buyQty)).toBe(false);
  });
});

describe("isValidDiscountPayQty", () => {
  it.each([1, 2, 999])("accepts the whole number %j", (payQty) => {
    expect(isValidDiscountPayQty(payQty)).toBe(true);
  });

  it.each([0, -1, ...NOT_WHOLE])("rejects %j", (payQty) => {
    expect(isValidDiscountPayQty(payQty)).toBe(false);
  });
});

describe("isValidDiscountBuyNPayM", () => {
  it.each([
    [2, 1],
    [3, 2],
    [10, 1],
  ])("accepts buying %j and paying %j", (buyQty, payQty) => {
    expect(isValidDiscountBuyNPayM(buyQty, payQty)).toBe(true);
  });

  it.each([
    [2, 2],
    [2, 3],
    [1, 0],
    [3, 0],
    [3, 1.5],
    [2.5, 1],
  ])("rejects buying %j and paying %j", (buyQty, payQty) => {
    expect(isValidDiscountBuyNPayM(buyQty, payQty)).toBe(false);
  });

  it("accepts exactly the whole pairs that pay at least one and fewer than they buy", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -50, max: 50 }),
        fc.integer({ min: -50, max: 50 }),
        (buyQty, payQty) => {
          expect(isValidDiscountBuyNPayM(buyQty, payQty)).toBe(payQty >= 1 && buyQty > payQty);
        },
      ),
    );
  });
});

describe("isBuyNPayMSaleUnit", () => {
  it("accepts a product sold by the unit", () => {
    expect(isBuyNPayMSaleUnit("UNIT")).toBe(true);
  });

  it("rejects a product sold by weight, and a target with no sale unit", () => {
    expect(isBuyNPayMSaleUnit("KG")).toBe(false);
    expect(isBuyNPayMSaleUnit(null)).toBe(false);
  });
});
