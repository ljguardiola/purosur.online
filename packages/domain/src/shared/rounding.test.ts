import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { compareFractions, roundHalfUp } from "./rounding.js";

const LARGE_PRICE_CENTS = 2_147_483_647;

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
    [-1n, 3n, 0],
    [-2n, 3n, -1],
    [-1n, 2n, 0],
    [-3n, 2n, -1],
    [-1500n, 1000n, -1],
    [-1501n, 1000n, -2],
    [-10n, 5n, -2],
  ])(
    "rounds the negative %s / %s to %s, a half towards the larger value",
    (numerator, denominator, expected) => {
      expect(roundHalfUp({ numerator, denominator })).toBe(expected);
    },
  );

  it("is exact for values beyond the safe integer range", () => {
    const numerator = BigInt(LARGE_PRICE_CENTS) * 1_000_000n * 1000n + 500n;

    expect(roundHalfUp({ numerator, denominator: 1000n })).toBe(LARGE_PRICE_CENTS * 1_000_000 + 1);
  });

  it("is within half a unit of the exact value for every fraction of either sign", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: -(10n ** 15n), max: 10n ** 15n }),
        fc.bigInt({ min: 1n, max: 10n ** 6n }),
        (numerator, denominator) => {
          const rounded = BigInt(roundHalfUp({ numerator, denominator }));

          expect(2n * (numerator - rounded * denominator)).toBeLessThan(denominator);
          expect(2n * (rounded * denominator - numerator)).toBeLessThanOrEqual(denominator);
        },
      ),
    );
  });
});

describe("compareFractions", () => {
  it("orders fractions by value whatever their reduction", () => {
    expect(
      compareFractions({ numerator: 1n, denominator: 3n }, { numerator: 1n, denominator: 2n }),
    ).toBeLessThan(0);
    expect(
      compareFractions({ numerator: 2n, denominator: 3n }, { numerator: 1n, denominator: 2n }),
    ).toBeGreaterThan(0);
    expect(
      compareFractions({ numerator: 2n, denominator: 4n }, { numerator: 1n, denominator: 2n }),
    ).toBe(0);
  });

  it("agrees with the sign of the difference of the values for any two fractions", () => {
    const fraction = fc.record({
      numerator: fc.bigInt({ min: 0n, max: 10n ** 12n }),
      denominator: fc.bigInt({ min: 1n, max: 10n ** 12n }),
    });
    fc.assert(
      fc.property(fraction, fraction, (a, b) => {
        const difference = a.numerator * b.denominator - b.numerator * a.denominator;
        expect(Math.sign(compareFractions(a, b))).toBe(
          difference > 0n ? 1 : difference < 0n ? -1 : 0,
        );
      }),
    );
  });
});
