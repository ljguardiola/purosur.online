import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { compareFractions, type Fraction, MAX_CASH_AMOUNT_CENTS } from "../../shared/index.js";
import {
  cheapestFirst,
  isReferenceUnitCost,
  type LoadedSupplierPrice,
  lotCostIsPrice,
  proposedReferenceCost,
  referenceCostOf,
  referenceCostOfPrice,
  selectableSupplierPrices,
} from "./lot-reference-cost.js";
import { lotValueCents } from "./lot-value.js";
import { STOCK_QUANTITY_PER_UNIT } from "./stock-quantity.js";
import { lotUnitCostCents } from "./unit-cost.js";

describe("referenceCostOf", () => {
  it("is the typed cost for exactly one sale unit", () => {
    expect(referenceCostOf(1_234)).toEqual({
      totalCents: 1_234,
      quantity: STOCK_QUANTITY_PER_UNIT,
    });
  });

  it("shows back as the typed cost per sale unit", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: MAX_CASH_AMOUNT_CENTS }), (cents) => {
        expect(lotUnitCostCents({ cost: referenceCostOf(cents), costIncomplete: false })).toBe(
          cents,
        );
      }),
    );
  });

  it("values a quantity of the lot at the typed cost, rounded only once at the end", () => {
    expect(
      lotValueCents({ remaining: 2_500, cost: referenceCostOf(333), costIncomplete: false }),
    ).toBe(833);
    expect(lotValueCents({ remaining: 1, cost: referenceCostOf(333), costIncomplete: false })).toBe(
      0,
    );
    expect(lotValueCents({ remaining: 2, cost: referenceCostOf(333), costIncomplete: false })).toBe(
      1,
    );
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

function price(
  supplierItemId: string,
  pricePerSaleUnit: Fraction,
  extra: Partial<LoadedSupplierPrice> = {},
): LoadedSupplierPrice {
  return {
    supplierItemId,
    supplierName: "Distribuidora Sur",
    quantity: 12_000,
    saleUnit: "UNIT",
    listDate: "2026-03-01",
    pricePerSaleUnit,
    ...extra,
  };
}

const positiveFraction = fc.record({
  numerator: fc.bigInt({ min: 1n, max: 10n ** 12n }),
  denominator: fc.bigInt({ min: 1n, max: 10n ** 9n }),
});

function greatestCommonDivisor(a: bigint, b: bigint): bigint {
  return b === 0n ? a : greatestCommonDivisor(b, a % b);
}

describe("referenceCostOfPrice", () => {
  it("costs the sale units of the denominator at the numerator, in thousandths of a sale unit", () => {
    expect(referenceCostOfPrice({ numerator: 1_000n, denominator: 3n })).toEqual({
      totalCents: 1,
      quantity: 3,
    });
    expect(referenceCostOfPrice({ numerator: 7n, denominator: 3n })).toEqual({
      totalCents: 7,
      quantity: 3_000,
    });
  });

  it("reduces the cost by the factors the thousandths share with the numerator", () => {
    expect(referenceCostOfPrice({ numerator: 1_500n, denominator: 7n })).toEqual({
      totalCents: 3,
      quantity: 14,
    });
  });

  it("keeps the price exactly, never rounded, and as small as it can be", () => {
    fc.assert(
      fc.property(positiveFraction, (fraction) => {
        const cost = referenceCostOfPrice(fraction);
        if (cost === null) {
          return;
        }
        expect(
          BigInt(cost.totalCents) * BigInt(STOCK_QUANTITY_PER_UNIT) * fraction.denominator,
        ).toBe(fraction.numerator * BigInt(cost.quantity));
        expect(greatestCommonDivisor(BigInt(cost.totalCents), BigInt(cost.quantity))).toBe(1n);
      }),
    );
  });

  it("has no cost for a price of nothing", () => {
    expect(referenceCostOfPrice({ numerator: 0n, denominator: 1n })).toBeNull();
    expect(referenceCostOfPrice({ numerator: 0n, denominator: 7n })).toBeNull();
  });

  it("has no cost for a price that does not fit the whole numbers a cost is stored in", () => {
    const limit = BigInt(Number.MAX_SAFE_INTEGER);
    expect(referenceCostOfPrice({ numerator: limit, denominator: 1n })).toEqual({
      totalCents: Number.MAX_SAFE_INTEGER,
      quantity: STOCK_QUANTITY_PER_UNIT,
    });
    expect(referenceCostOfPrice({ numerator: limit + 2n, denominator: 1n })).toBeNull();
    expect(referenceCostOfPrice({ numerator: 1_000n, denominator: limit })).toEqual({
      totalCents: 1,
      quantity: Number.MAX_SAFE_INTEGER,
    });
    expect(referenceCostOfPrice({ numerator: 1_000n, denominator: limit + 1n })).toBeNull();
    expect(referenceCostOfPrice({ numerator: 1n, denominator: limit })).toBeNull();
    expect(referenceCostOfPrice({ numerator: 1n, denominator: limit / 1_000n })).toEqual({
      totalCents: 1,
      quantity: Number(limit / 1_000n) * STOCK_QUANTITY_PER_UNIT,
    });
  });

  it("shows back as the price rounded to a cent per sale unit", () => {
    expect(
      lotUnitCostCents({
        cost: referenceCostOfPrice({ numerator: 1_000n, denominator: 3n }),
        costIncomplete: false,
      }),
    ).toBe(333);
  });
});

describe("lotCostIsPrice", () => {
  it("is true for the cost of the price whatever the reduction of either", () => {
    expect(
      lotCostIsPrice({ totalCents: 3, quantity: 14 }, { numerator: 3_000n, denominator: 14n }),
    ).toBe(true);
    expect(lotCostIsPrice(referenceCostOf(250), { numerator: 500n, denominator: 2n })).toBe(true);
  });

  it("is false for another price, even one that rounds to the same cents", () => {
    expect(lotCostIsPrice(referenceCostOf(250), { numerator: 2_501n, denominator: 10n })).toBe(
      false,
    );
    expect(lotCostIsPrice(referenceCostOf(250), { numerator: 249n, denominator: 1n })).toBe(false);
  });

  it("is false when the lot has no cost", () => {
    expect(lotCostIsPrice(null, { numerator: 250n, denominator: 1n })).toBe(false);
  });

  it("holds for the cost of every price", () => {
    fc.assert(
      fc.property(positiveFraction, (fraction) => {
        expect(lotCostIsPrice(referenceCostOfPrice(fraction), fraction)).toBe(
          referenceCostOfPrice(fraction) !== null,
        );
      }),
    );
  });
});

describe("cheapestFirst", () => {
  it("orders by price per sale unit whatever the reduction of the fractions", () => {
    const sorted = cheapestFirst([
      price("a", { numerator: 1n, denominator: 2n }),
      price("b", { numerator: 1n, denominator: 3n }),
      price("c", { numerator: 5n, denominator: 10n }),
    ]);

    expect(sorted.map((entry) => entry.supplierItemId)).toEqual(["b", "a", "c"]);
  });

  it("keeps prices tied in value in the order given", () => {
    const tied = { numerator: 100n, denominator: 1n };
    const sorted = cheapestFirst([
      price("z", tied, { supplierName: "Zeta" }),
      price("cheap", { numerator: 1n, denominator: 1n }),
      price("B", { numerator: 200n, denominator: 2n }, { supplierName: "Ábaco" }),
      price("a", tied, { supplierName: "Ábaco" }),
    ]);

    expect(sorted.map((entry) => entry.supplierItemId)).toEqual(["cheap", "z", "B", "a"]);
  });

  it("leaves the given prices as they were", () => {
    const given = [
      price("a", { numerator: 2n, denominator: 1n }),
      price("b", { numerator: 1n, denominator: 1n }),
    ];

    cheapestFirst(given);

    expect(given.map((entry) => entry.supplierItemId)).toEqual(["a", "b"]);
  });

  it("puts a price no dearer than the others first, whatever the order given", () => {
    const fractions = fc.array(positiveFraction, { minLength: 1, maxLength: 6 });
    fc.assert(
      fc.property(fractions, (list) => {
        const sorted = cheapestFirst(
          list.map((fraction, index) => price(`item-${index}`, fraction)),
        );
        const [first] = sorted;
        for (const other of sorted) {
          expect(
            compareFractions(
              first?.pricePerSaleUnit ?? other.pricePerSaleUnit,
              other.pricePerSaleUnit,
            ),
          ).toBeLessThanOrEqual(0);
        }
        expect(sorted).toHaveLength(list.length);
      }),
    );
  });
});

describe("selectableSupplierPrices", () => {
  it("keeps the prices whose exact cost can be stored, cheapest first", () => {
    const selectable = selectableSupplierPrices([
      price("huge", { numerator: BigInt(Number.MAX_SAFE_INTEGER) + 2n, denominator: 1n }),
      price("dear", { numerator: 900n, denominator: 1n }),
      price("cheap", { numerator: 100n, denominator: 1n }),
    ]);

    expect(selectable.map((entry) => entry.supplierItemId)).toEqual(["cheap", "dear"]);
  });

  it("leaves out a price of nothing", () => {
    const selectable = selectableSupplierPrices([
      price("free", { numerator: 0n, denominator: 1n }),
      price("cheap", { numerator: 100n, denominator: 1n }),
    ]);

    expect(selectable.map((entry) => entry.supplierItemId)).toEqual(["cheap"]);
  });
});

describe("proposedReferenceCost", () => {
  it("is the cost of the cheapest price", () => {
    expect(
      proposedReferenceCost([
        price("a", { numerator: 900n, denominator: 1n }),
        price("b", { numerator: 1_000n, denominator: 3n }),
      ]),
    ).toEqual({ totalCents: 1, quantity: 3 });
  });

  it("is the cost of the cheapest price that can be stored", () => {
    expect(
      proposedReferenceCost([
        price("huge", { numerator: 1n, denominator: BigInt(Number.MAX_SAFE_INTEGER) }),
        price("a", { numerator: 900n, denominator: 1n }),
      ]),
    ).toEqual({ totalCents: 9, quantity: 10 });
  });

  it("is nothing when the only price loaded is of nothing", () => {
    expect(proposedReferenceCost([price("free", { numerator: 0n, denominator: 1n })])).toBeNull();
  });

  it("is nothing when no price is loaded", () => {
    expect(proposedReferenceCost([])).toBeNull();
  });
});
