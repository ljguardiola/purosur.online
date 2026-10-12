import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MAX_CASH_AMOUNT_CENTS } from "../../shared/index.js";
import { lotValueCents } from "./lot-value.js";
import { isReferenceUnitCost, referenceCostOf } from "./lot-reference-cost.js";
import { STOCK_QUANTITY_PER_UNIT } from "./stock-quantity.js";
import { lotUnitCostCents } from "./unit-cost.js";

describe("referenceCostOf", () => {
  it("is the typed cost for exactly one sale unit", () => {
    expect(referenceCostOf(1_234)).toEqual({ totalCents: 1_234, quantity: STOCK_QUANTITY_PER_UNIT });
  });

  it("shows back as the typed cost per sale unit", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: MAX_CASH_AMOUNT_CENTS }), (cents) => {
        expect(
          lotUnitCostCents({ cost: referenceCostOf(cents), costIncomplete: false }),
        ).toBe(cents);
      }),
    );
  });

  it("values a quantity of the lot at the typed cost, rounded only once at the end", () => {
    expect(
      lotValueCents({ remaining: 2_500, cost: referenceCostOf(333), costIncomplete: false }),
    ).toBe(833);
    expect(
      lotValueCents({ remaining: 1, cost: referenceCostOf(333), costIncomplete: false }),
    ).toBe(0);
    expect(
      lotValueCents({ remaining: 2, cost: referenceCostOf(333), costIncomplete: false }),
    ).toBe(1);
  });
});

describe("isReferenceUnitCost", () => {
  it("accepts a whole positive number of cents up to the largest amount", () => {
    expect(isReferenceUnitCost(1)).toBe(true);
    expect(isReferenceUnitCost(MAX_CASH_AMOUNT_CENTS)).toBe(true);
  });

  it("refuses zero, negatives, fractions, amounts above the largest and non-numbers", () => {
    expect(isReferenceUnitCost(0)).toBe(false);
    expect(isReferenceUnitCost(-1)).toBe(false);
    expect(isReferenceUnitCost(10.5)).toBe(false);
    expect(isReferenceUnitCost(MAX_CASH_AMOUNT_CENTS + 1)).toBe(false);
    expect(isReferenceUnitCost(Number.NaN)).toBe(false);
  });
});
