import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isLotInStock, knownLotCost, lotValueCents } from "./lot-value.js";

const cost = { totalCents: 5_000, quantity: 1_000 };

describe("knownLotCost", () => {
  it("is the lot's cost pair while its cost is complete", () => {
    expect(knownLotCost({ cost, costIncomplete: false })).toBe(cost);
  });

  it("is none for a lot without a cost", () => {
    expect(knownLotCost({ cost: null, costIncomplete: true })).toBeNull();
  });

  it("is none for a lot flagged incomplete even when it holds a cost", () => {
    expect(knownLotCost({ cost, costIncomplete: true })).toBeNull();
  });
});

describe("lotValueCents", () => {
  it("values the remaining quantity at the lot's cost per quantity", () => {
    expect(lotValueCents({ remaining: 4_000, cost, costIncomplete: false })).toBe(20_000);
  });

  it("rounds half a cent up", () => {
    expect(
      lotValueCents({ remaining: 1, cost: { totalCents: 1, quantity: 2 }, costIncomplete: false }),
    ).toBe(1);
    expect(
      lotValueCents({ remaining: 1, cost: { totalCents: 1, quantity: 3 }, costIncomplete: false }),
    ).toBe(0);
  });

  it("values a lot in debt as minus the value of what it owes", () => {
    expect(lotValueCents({ remaining: -4_000, cost, costIncomplete: false })).toBe(-20_000);
  });

  it("values a lot in debt rounding half a cent away from zero", () => {
    expect(
      lotValueCents({ remaining: -1, cost: { totalCents: 1, quantity: 2 }, costIncomplete: false }),
    ).toBe(-1);
  });

  it("values a lot with nothing left at exactly zero", () => {
    expect(lotValueCents({ remaining: 0, cost, costIncomplete: false })).toBe(0);
  });

  it("values a small debt that rounds to nothing at exactly zero", () => {
    expect(
      lotValueCents({ remaining: -1, cost: { totalCents: 1, quantity: 3 }, costIncomplete: false }),
    ).toBe(0);
  });

  it("gives no value to a lot without a cost", () => {
    expect(lotValueCents({ remaining: 4_000, cost: null, costIncomplete: true })).toBeNull();
  });

  it("gives no value to a lot flagged incomplete even when it holds a cost", () => {
    expect(lotValueCents({ remaining: 4_000, cost, costIncomplete: true })).toBeNull();
  });

  const lotArbitrary = fc.record({
    remaining: fc.integer({ min: -100_000_000, max: 100_000_000 }),
    cost: fc.record({
      totalCents: fc.integer({ min: 0, max: 10_000_000 }),
      quantity: fc.integer({ min: 1, max: 1_000_000 }),
    }),
  });

  it("is within half a cent of the exact value", () => {
    fc.assert(
      fc.property(lotArbitrary, ({ remaining, cost: lotCost }) => {
        const value = lotValueCents({ remaining, cost: lotCost, costIncomplete: false });

        const exactTwice = BigInt(remaining) * BigInt(lotCost.totalCents) * 2n;
        const valueTwice = BigInt(value ?? 0) * BigInt(lotCost.quantity) * 2n;
        const distance = exactTwice - valueTwice;
        expect(distance < 0n ? -distance : distance).toBeLessThanOrEqual(BigInt(lotCost.quantity));
      }),
    );
  });

  it("values a debt as minus the value of the same quantity in stock", () => {
    fc.assert(
      fc.property(lotArbitrary, ({ remaining, cost: lotCost }) => {
        const owed = lotValueCents({
          remaining: -Math.abs(remaining),
          cost: lotCost,
          costIncomplete: false,
        });
        const held = lotValueCents({
          remaining: Math.abs(remaining),
          cost: lotCost,
          costIncomplete: false,
        });

        expect(owed).toBe(held === 0 ? 0 : -(held as number));
      }),
    );
  });
});

describe("isLotInStock", () => {
  it.each([5, -5])("keeps a lot with %i remaining", (remaining) => {
    expect(isLotInStock({ remaining })).toBe(true);
  });

  it("drops a lot with nothing remaining", () => {
    expect(isLotInStock({ remaining: 0 })).toBe(false);
  });
});
