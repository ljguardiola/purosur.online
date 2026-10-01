import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { DiscountBenefit } from "./discount-benefit.js";
import { discountedAmount, lineAmount } from "./discounted-amount.js";
import { MAX_UNIT_PRICE_CENTS } from "./price.js";

const TEN_PERCENT: DiscountBenefit = { kind: "PERCENT_OFF", percent: 10 };
const THREE_FOR_TWO: DiscountBenefit = { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 };

function units(count: number) {
  return { saleUnit: "UNIT", units: count } as const;
}

function weight(thousandths: number) {
  return { saleUnit: "KG", thousandths } as const;
}

describe("lineAmount", () => {
  it("is the units times the unit price for a unit line", () => {
    expect(lineAmount(units(3), 2500)).toEqual({ numerator: 7500n, denominator: 1n });
  });

  it("is the thousandths of a kilogram times the price per kilogram, over 1000, for a weight line", () => {
    expect(lineAmount(weight(1250), 9000)).toEqual({ numerator: 11_250_000n, denominator: 1000n });
  });
});

describe("discountedAmount with a percentage", () => {
  it("takes the percentage off the exact amount of a unit line", () => {
    expect(discountedAmount(units(2), 2500, TEN_PERCENT)).toEqual({
      numerator: 5000n * 90n,
      denominator: 100n,
    });
  });

  it("takes the percentage off the exact amount of a weight line", () => {
    expect(discountedAmount(weight(1250), 9000, TEN_PERCENT)).toEqual({
      numerator: 11_250_000n * 90n,
      denominator: 100_000n,
    });
  });

  it("is nothing at 100 % off", () => {
    expect(discountedAmount(units(3), 2500, { kind: "PERCENT_OFF", percent: 100 }).numerator).toBe(
      0n,
    );
  });

  it("is never more than the list amount nor negative", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MAX_UNIT_PRICE_CENTS }),
        fc.integer({ min: 1, max: 100_000_000 }),
        fc.integer({ min: 1, max: 100 }),
        (price, thousandths, percent) => {
          const listed = lineAmount(weight(thousandths), price);

          const discounted = discountedAmount(weight(thousandths), price, {
            kind: "PERCENT_OFF",
            percent,
          });

          expect(discounted.numerator).toBeGreaterThanOrEqual(0n);
          expect(discounted.numerator * listed.denominator).toBeLessThanOrEqual(
            listed.numerator * discounted.denominator,
          );
        },
      ),
    );
  });

  it("is the exact rational calculation for every price, weight and percentage", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MAX_UNIT_PRICE_CENTS }),
        fc.integer({ min: 1, max: 100_000_000 }),
        fc.integer({ min: 1, max: 100 }),
        (price, thousandths, percent) => {
          const discounted = discountedAmount(weight(thousandths), price, {
            kind: "PERCENT_OFF",
            percent,
          });

          expect(discounted.numerator * 100_000n).toBe(
            BigInt(thousandths) * BigInt(price) * BigInt(100 - percent) * discounted.denominator,
          );
        },
      ),
    );
  });
});

describe("discountedAmount with buy N, pay M", () => {
  it.each([
    [1, 1],
    [2, 2],
    [3, 2],
    [4, 3],
    [5, 4],
    [6, 4],
    [7, 5],
  ])("charges %s units as %s", (count, charged) => {
    expect(discountedAmount(units(count), 100, THREE_FOR_TWO)).toEqual({
      numerator: BigInt(charged * 100),
      denominator: 1n,
    });
  });

  it("is the list amount for a weight line", () => {
    expect(discountedAmount(weight(3000), 100, THREE_FOR_TWO)).toEqual(
      lineAmount(weight(3000), 100),
    );
  });

  it("does not lose precision with the largest price and many groups", () => {
    expect(discountedAmount(units(30_000), MAX_UNIT_PRICE_CENTS, THREE_FOR_TWO)).toEqual({
      numerator: BigInt(20_000 * MAX_UNIT_PRICE_CENTS),
      denominator: 1n,
    });
  });

  it("charges for every quantity what the groups and the leftover units add up to", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 20 }),
        fc.integer({ min: 1, max: 19 }),
        fc.integer({ min: 1, max: 500 }),
        fc.integer({ min: 0, max: MAX_UNIT_PRICE_CENTS }),
        (buyQty, requestedPayQty, count, price) => {
          const payQty = Math.min(requestedPayQty, buyQty - 1);
          const chargedUnits = Math.floor(count / buyQty) * payQty + (count % buyQty);

          expect(
            discountedAmount(units(count), price, { kind: "BUY_N_PAY_M", buyQty, payQty }),
          ).toEqual({ numerator: BigInt(chargedUnits * price), denominator: 1n });
        },
      ),
    );
  });
});
