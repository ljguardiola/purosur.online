import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MAX_UNIT_PRICE_CENTS } from "../../pricing/index.js";
import { roundHalfUp } from "./rounding.js";

describe("roundHalfUp", () => {
  it.each([
    [0n, 1000n, 0],
    [1n, 2n, 1],
    [3n, 2n, 2],
    [1n, 3n, 0],
    [2n, 3n, 1],
    [499n, 1000n, 0],
    [500n, 1000n, 1],
    [501n, 1000n, 1],
    [1499n, 1000n, 1],
    [1500n, 1000n, 2],
    [10n, 5n, 2],
  ])("rounds %s / %s to %s", (numerator, denominator, expected) => {
    expect(roundHalfUp({ numerator, denominator })).toBe(expected);
  });

  it.each([
    [-1n, 2n, -1],
    [-3n, 2n, -2],
    [-1n, 3n, 0],
    [-2n, 3n, -1],
    [1n, -2n, -1],
    [-1n, -2n, 1],
  ])("rounds half away from zero: %s / %s to %s", (numerator, denominator, expected) => {
    expect(roundHalfUp({ numerator, denominator })).toBe(expected);
  });

  it("is exact for values beyond the safe integer range", () => {
    const numerator = BigInt(MAX_UNIT_PRICE_CENTS) * 1_000_000n * 1000n + 500n;

    expect(roundHalfUp({ numerator, denominator: 1000n })).toBe(
      MAX_UNIT_PRICE_CENTS * 1_000_000 + 1,
    );
  });

  it("is within half a unit of the exact value for every fraction", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10n ** 15n }),
        fc.bigInt({ min: 1n, max: 10n ** 6n }),
        (numerator, denominator) => {
          const rounded = BigInt(roundHalfUp({ numerator, denominator }));

          expect(2n * (numerator - rounded * denominator)).toBeLessThan(denominator);
          expect(2n * (rounded * denominator - numerator)).toBeLessThanOrEqual(denominator);
        },
      ),
    );
  });

  it("mirrors around zero", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10n ** 15n }),
        fc.bigInt({ min: 1n, max: 10n ** 6n }),
        (numerator, denominator) => {
          expect(roundHalfUp({ numerator: -numerator, denominator })).toBe(
            -roundHalfUp({ numerator, denominator }) || 0,
          );
        },
      ),
    );
  });
});
