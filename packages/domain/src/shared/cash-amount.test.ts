import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isValidCashAmount, MAX_CASH_AMOUNT_CENTS } from "./cash-amount.js";

describe("isValidCashAmount", () => {
  it("accepts zero and the largest amount a Postgres integer holds", () => {
    expect(MAX_CASH_AMOUNT_CENTS).toBe(2_147_483_647);
    expect(isValidCashAmount(0)).toBe(true);
    expect(isValidCashAmount(MAX_CASH_AMOUNT_CENTS)).toBe(true);
  });

  it("rejects a negative amount and one above the ceiling", () => {
    expect(isValidCashAmount(-1)).toBe(false);
    expect(isValidCashAmount(MAX_CASH_AMOUNT_CENTS + 1)).toBe(false);
  });

  it("rejects an amount with a fraction of a cent and a non-finite one", () => {
    for (const cents of [0.5, 1250.25, Number.NaN, Number.POSITIVE_INFINITY, -Number.NaN]) {
      expect(isValidCashAmount(cents), String(cents)).toBe(false);
    }
  });

  it("accepts every whole number of cents within the range", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MAX_CASH_AMOUNT_CENTS }), (cents) => {
        expect(isValidCashAmount(cents)).toBe(true);
      }),
    );
  });

  it("rejects every whole number of cents outside the range", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer({ min: MAX_CASH_AMOUNT_CENTS + 1, max: Number.MAX_SAFE_INTEGER }),
          fc.integer({ min: Number.MIN_SAFE_INTEGER, max: -1 }),
        ),
        (cents) => {
          expect(isValidCashAmount(cents)).toBe(false);
        },
      ),
    );
  });
});
