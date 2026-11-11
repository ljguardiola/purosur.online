import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { amountToChargeInCash } from "./cash-charge.js";
import { changeDiscountOption } from "./change-discount-option.js";

const THOUSAND_PESOS = 100_000;

describe("changeDiscountOption", () => {
  it("offers what brings the amount to charge down to a multiple of $1.000", () => {
    expect(changeDiscountOption(2_519_250)).toBe(10_000);
  });

  it("offers the hundreds of the amount to charge rounded down to the smallest bill", () => {
    expect(changeDiscountOption(345_000)).toBe(40_000);
  });

  it("offers nothing when the amount to charge is already a multiple of $1.000", () => {
    expect(changeDiscountOption(2_009_999)).toBeNull();
  });

  it.each([99_999, 50_000, 8000, 1])(
    "offers nothing when the amount to charge %s is below $1.000",
    (amountDue) => {
      expect(changeDiscountOption(amountDue)).toBeNull();
    },
  );

  it("offers nothing for an amount just above $1.000 that rounds down to it, and the hundreds of one that does not", () => {
    expect(changeDiscountOption(100_001)).toBeNull();
    expect(changeDiscountOption(110_000)).toBe(10_000);
  });

  it("leaves an amount to charge that is a positive multiple of $1.000 with the same rounding", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100_000_000 }), (amountDue) => {
        const option = changeDiscountOption(amountDue);
        const toCharge = amountToChargeInCash(amountDue);
        if (option === null) {
          expect(toCharge < THOUSAND_PESOS || toCharge % THOUSAND_PESOS === 0).toBe(true);
          return;
        }
        expect(option).toBeGreaterThan(0);
        expect(option).toBeLessThan(THOUSAND_PESOS);
        const discounted = amountToChargeInCash(amountDue - option);
        expect(discounted).toBe(toCharge - option);
        expect(discounted % THOUSAND_PESOS).toBe(0);
        expect(discounted).toBeGreaterThan(0);
        expect(amountDue - option - discounted).toBe(amountDue - toCharge);
      }),
    );
  });
});
