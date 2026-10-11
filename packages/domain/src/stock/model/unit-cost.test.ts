import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MAX_CASH_AMOUNT_CENTS } from "../../shared/index.js";
import { MAX_STOCK_QUANTITY, STOCK_QUANTITY_PER_UNIT } from "./stock-quantity.js";
import { unitCostCents } from "./unit-cost.js";

describe("unitCostCents", () => {
  it("is the amount paid when a line is loaded by sale unit", () => {
    expect(unitCostCents(1_500, STOCK_QUANTITY_PER_UNIT)).toBe(1_500);
  });

  it("divides what was paid for a package by the units it holds", () => {
    expect(unitCostCents(12_000, 12_000)).toBe(1_000);
    expect(unitCostCents(100_000, 25_000)).toBe(4_000);
  });

  it("rounds half up to the cent", () => {
    expect(unitCostCents(1_000, 3_000)).toBe(333);
    expect(unitCostCents(2_000, 3_000)).toBe(667);
    expect(unitCostCents(1_005, 2_000)).toBe(503);
    expect(unitCostCents(1_001, 2_000)).toBe(501);
    expect(unitCostCents(1_000, 2_000)).toBe(500);
  });

  it("keeps the exact fraction for the largest cost and the smallest package", () => {
    expect(unitCostCents(MAX_CASH_AMOUNT_CENTS, 1)).toBe(2_147_483_647_000);
  });

  it("is the nearest whole cent of the exact fraction", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MAX_CASH_AMOUNT_CENTS }),
        fc.integer({ min: 1, max: MAX_STOCK_QUANTITY }),
        (paid, quantityPerPackage) => {
          const exact = BigInt(paid) * 1000n;
          const rounded = BigInt(unitCostCents(paid, quantityPerPackage));
          const denominator = BigInt(quantityPerPackage);
          expect(2n * (rounded * denominator - exact) <= denominator).toBe(true);
          expect(2n * (exact - rounded * denominator) < denominator).toBe(true);
        },
      ),
    );
  });
});
