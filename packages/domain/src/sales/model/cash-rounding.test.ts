import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { SMALLEST_CASH_BILL } from "../../payments/index.js";
import { mayBeCashRounding } from "./cash-rounding.js";

describe("mayBeCashRounding", () => {
  it("accepts any whole amount below the smallest cash bill", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: SMALLEST_CASH_BILL - 1 }), (amount) => {
        expect(mayBeCashRounding(amount)).toBe(true);
      }),
    );
  });

  it("refuses an amount of the smallest cash bill or more", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: SMALLEST_CASH_BILL, max: 10 * SMALLEST_CASH_BILL }),
        (amount) => {
          expect(mayBeCashRounding(amount)).toBe(false);
        },
      ),
    );
  });

  it.each([
    [0, true],
    [SMALLEST_CASH_BILL - 1, true],
    [SMALLEST_CASH_BILL, false],
    [-1, false],
  ])("answers %i at the edges of the range as %s", (amount, expected) => {
    expect(mayBeCashRounding(amount)).toBe(expected);
  });

  it("refuses a negative amount", () => {
    fc.assert(
      fc.property(fc.integer({ min: -1_000_000, max: -1 }), (amount) => {
        expect(mayBeCashRounding(amount)).toBe(false);
      }),
    );
  });

  it("refuses an amount with cents of a cent", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: SMALLEST_CASH_BILL - 1, noNaN: true }), (amount) => {
        fc.pre(!Number.isInteger(amount));
        expect(mayBeCashRounding(amount)).toBe(false);
      }),
    );
  });
});
