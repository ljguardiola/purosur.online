import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { productUnitCostCents, productValueCents, stockCorrection } from "./product-valuation.js";

describe("productValueCents", () => {
  it("is the sum of its lots' values", () => {
    expect(productValueCents([20_000, 1_500, -500])).toBe(21_000);
  });

  it("has no value when any lot has none", () => {
    expect(productValueCents([20_000, null])).toBeNull();
  });

  it("has no value when it has no lot", () => {
    expect(productValueCents([])).toBeNull();
  });

  it("is zero when its lots offset each other", () => {
    expect(productValueCents([500, -500])).toBe(0);
  });
});

describe("productUnitCostCents", () => {
  it("divides the value by the balance, per sale unit", () => {
    expect(productUnitCostCents({ valueCents: 20_000, balance: 4_000 })).toBe(5_000);
  });

  it("rounds half a cent up", () => {
    expect(productUnitCostCents({ valueCents: 1, balance: 2_000 })).toBe(1);
    expect(productUnitCostCents({ valueCents: 1, balance: 3_000 })).toBe(0);
  });

  it("rounds half a cent away from zero for a debt", () => {
    expect(productUnitCostCents({ valueCents: -1, balance: -2_000 })).toBe(1);
    expect(productUnitCostCents({ valueCents: 1, balance: -2_000 })).toBe(-1);
    expect(productUnitCostCents({ valueCents: -1, balance: 2_000 })).toBe(-1);
  });

  it("is a plain zero when the value divided by the balance rounds to nothing", () => {
    expect(Object.is(productUnitCostCents({ valueCents: -1, balance: 3_000 }), 0)).toBe(true);
    expect(Object.is(productUnitCostCents({ valueCents: 1, balance: -3_000 }), 0)).toBe(true);
  });

  it("has none without a value", () => {
    expect(productUnitCostCents({ valueCents: null, balance: 4_000 })).toBeNull();
  });

  it("has none without a balance", () => {
    expect(productUnitCostCents({ valueCents: 20_000, balance: 0 })).toBeNull();
  });

  it("is within half a cent of the exact value per sale unit", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -2_000_000_000, max: 2_000_000_000 }),
        fc.integer({ min: -100_000_000, max: 100_000_000 }).filter((balance) => balance !== 0),
        (valueCents, balance) => {
          const unitCost = productUnitCostCents({ valueCents, balance }) as number;

          const exactTwice = 2n * BigInt(valueCents) * 1000n;
          const roundedTwice = 2n * BigInt(unitCost) * BigInt(balance);
          const distance = exactTwice - roundedTwice;
          const magnitude = (n: bigint) => (n < 0n ? -n : n);
          expect(magnitude(distance)).toBeLessThanOrEqual(magnitude(BigInt(balance)));
        },
      ),
    );
  });
});

describe("stockCorrection", () => {
  it("is a count for a negative balance backed by a purchased lot", () => {
    expect(stockCorrection({ balance: -1_000, hasPurchasedLot: true })).toBe("count");
  });

  it("is a purchase or a count for a product without a purchased lot", () => {
    expect(stockCorrection({ balance: 0, hasPurchasedLot: false })).toBe("purchase_or_count");
    expect(stockCorrection({ balance: 3_000, hasPurchasedLot: false })).toBe("purchase_or_count");
  });

  it("is a purchase or a count, not a count, for a negative balance without a purchased lot", () => {
    expect(stockCorrection({ balance: -1_000, hasPurchasedLot: false })).toBe("purchase_or_count");
  });

  it("is none for a balance that is not negative backed by a purchased lot", () => {
    expect(stockCorrection({ balance: 0, hasPurchasedLot: true })).toBeNull();
    expect(stockCorrection({ balance: 4_000, hasPurchasedLot: true })).toBeNull();
  });
});
