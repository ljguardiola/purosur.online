import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type CostSource,
  FREIGHT_PER_UNIT_CENTS,
  lastCostSource,
  priceCostReference,
} from "./price-cost-reference.js";

function purchase(
  lineId: string,
  purchasedOn: string,
  recordedAt: string,
  cost = { totalCents: 1000, quantity: 1000 },
): CostSource {
  return { kind: "purchase_line", lineId, purchasedOn, recordedAt: new Date(recordedAt), cost };
}

function initialCount(
  countedAt: string,
  fields: Partial<Extract<CostSource, { kind: "initial_count" }>> = {},
): CostSource {
  return {
    kind: "initial_count",
    countedAt: new Date(countedAt),
    withdrawn: false,
    costIncomplete: false,
    cost: { totalCents: 700, quantity: 1000 },
    ...fields,
  };
}

describe("lastCostSource", () => {
  it("is none when there is no source", () => {
    expect(lastCostSource([])).toBeNull();
  });

  it("takes the purchase line with the latest purchase day", () => {
    const older = purchase("a", "2026-03-01", "2026-03-09T12:00:00Z");
    const newer = purchase("b", "2026-03-02", "2026-03-02T12:00:00Z");

    expect(lastCostSource([newer, older])).toBe(newer);
    expect(lastCostSource([older, newer])).toBe(newer);
  });

  it("breaks a tie of purchase days with the latest recorded instant", () => {
    const earlier = purchase("a", "2026-03-01", "2026-03-01T10:00:00Z");
    const later = purchase("b", "2026-03-01", "2026-03-01T11:00:00Z");

    expect(lastCostSource([later, earlier])).toBe(later);
    expect(lastCostSource([earlier, later])).toBe(later);
  });

  it("breaks a tie of day and instant with the lower line id", () => {
    const low = purchase("a", "2026-03-01", "2026-03-01T10:00:00Z");
    const high = purchase("b", "2026-03-01", "2026-03-01T10:00:00Z");

    expect(lastCostSource([high, low])).toBe(low);
    expect(lastCostSource([low, high])).toBe(low);
  });

  it("takes an initial count more recent than the last purchase", () => {
    const bought = purchase("a", "2026-03-01", "2026-03-01T10:00:00Z");
    const counted = initialCount("2026-03-05T15:00:00Z");

    expect(lastCostSource([bought, counted])).toBe(counted);
  });

  it("takes the purchase line when it is more recent than the initial count", () => {
    const counted = initialCount("2026-03-01T15:00:00Z");
    const bought = purchase("a", "2026-03-05", "2026-03-05T10:00:00Z");

    expect(lastCostSource([counted, bought])).toBe(bought);
  });

  it("dates an initial count at its Argentina calendar day", () => {
    const counted = initialCount("2026-03-02T01:00:00Z");
    const bought = purchase("a", "2026-03-02", "2026-03-02T00:30:00Z");

    expect(lastCostSource([bought, counted])).toBe(bought);
  });

  it("compares an initial count and a purchase on the same day by instant", () => {
    const counted = initialCount("2026-03-01T15:00:00Z");
    const boughtBefore = purchase("a", "2026-03-01", "2026-03-01T14:00:00Z");
    const boughtAfter = purchase("a", "2026-03-01", "2026-03-01T16:00:00Z");

    expect(lastCostSource([boughtBefore, counted])).toBe(counted);
    expect(lastCostSource([boughtAfter, counted])).toBe(boughtAfter);
  });

  it("prefers the purchase line over an initial count of the same day and instant", () => {
    const counted = initialCount("2026-03-01T15:00:00Z");
    const bought = purchase("a", "2026-03-01", "2026-03-01T15:00:00Z");

    expect(lastCostSource([counted, bought])).toBe(bought);
    expect(lastCostSource([bought, counted])).toBe(bought);
  });

  it("ignores a withdrawn initial count", () => {
    const bought = purchase("a", "2026-03-01", "2026-03-01T10:00:00Z");
    const withdrawn = initialCount("2026-03-05T15:00:00Z", { withdrawn: true });

    expect(lastCostSource([bought, withdrawn])).toBe(bought);
    expect(lastCostSource([withdrawn])).toBeNull();
  });

  it("ignores an initial count whose cost is still incomplete", () => {
    const bought = purchase("a", "2026-03-01", "2026-03-01T10:00:00Z");
    const incomplete = initialCount("2026-03-05T15:00:00Z", { costIncomplete: true });
    const untyped = initialCount("2026-03-05T15:00:00Z", { cost: null });

    expect(lastCostSource([bought, incomplete])).toBe(bought);
    expect(lastCostSource([incomplete])).toBeNull();
    expect(lastCostSource([untyped])).toBeNull();
  });

  it("ignores an initial count with incomplete flag even when a cost is stored", () => {
    const flagged = initialCount("2026-03-05T15:00:00Z", {
      costIncomplete: true,
      cost: { totalCents: 5, quantity: 1000 },
    });

    expect(lastCostSource([flagged])).toBeNull();
  });
});

const cost = fc.record({
  totalCents: fc.integer({ min: 0, max: 100_000_000 }),
  quantity: fc.integer({ min: 1, max: 1_000_000_000 }),
});
const price = fc.integer({ min: 1, max: 100_000_000 });

function sourceWith(c: { totalCents: number; quantity: number }): CostSource {
  return purchase("a", "2026-03-01", "2026-03-01T10:00:00Z", c);
}

describe("priceCostReference", () => {
  it("has no cost reference without a cost source", () => {
    expect(priceCostReference([], 2500)).toBeNull();
    expect(priceCostReference([initialCount("2026-03-01T10:00:00Z", { cost: null })], 2500)).toBe(
      null,
    );
  });

  it("shows the last cost, a zero freight, the total cost and the margin", () => {
    const reference = priceCostReference([sourceWith({ totalCents: 1200, quantity: 1000 })], 2000);

    expect(reference).toEqual({
      lastCostCents: 1200,
      freightPerUnitCents: 0,
      totalCostCents: 1200,
      marginTenthsOfPercent: 400,
    });
  });

  it("has no margin without a price", () => {
    expect(priceCostReference([sourceWith({ totalCents: 1200, quantity: 1000 })], null)).toEqual({
      lastCostCents: 1200,
      freightPerUnitCents: 0,
      totalCostCents: 1200,
      marginTenthsOfPercent: null,
    });
  });

  it("uses the cost of the last source", () => {
    const old = purchase("a", "2026-03-01", "2026-03-01T10:00:00Z", {
      totalCents: 100,
      quantity: 1000,
    });
    const latest = purchase("b", "2026-03-02", "2026-03-02T10:00:00Z", {
      totalCents: 300,
      quantity: 1000,
    });

    expect(priceCostReference([old, latest], 1000)).toMatchObject({ lastCostCents: 300 });
  });

  it("uses the typed reference cost of an initial count", () => {
    expect(priceCostReference([initialCount("2026-03-01T10:00:00Z")], 1000)).toMatchObject({
      lastCostCents: 700,
      marginTenthsOfPercent: 300,
    });
  });

  it("rounds each shown cost half up from the exact fraction per sale unit", () => {
    // 1001 cents for 2000 thousandths is 500.5 cents per unit
    expect(
      priceCostReference([sourceWith({ totalCents: 1001, quantity: 2000 })], 1000),
    ).toMatchObject({ lastCostCents: 501, totalCostCents: 501 });
    // 1000 cents for 3000 thousandths is 333.33 cents per unit
    expect(
      priceCostReference([sourceWith({ totalCents: 1000, quantity: 3000 })], 1000),
    ).toMatchObject({ lastCostCents: 333, totalCostCents: 333 });
  });

  it("computes the margin from the exact cost, not the rounded one", () => {
    // exact cost 500.5, price 1001: margin exactly 50.0 %, rounded cost 501 would give 49.95 %
    expect(
      priceCostReference([sourceWith({ totalCents: 1001, quantity: 2000 })], 1001),
    ).toMatchObject({ marginTenthsOfPercent: 500 });
  });

  it("rounds the margin half up to a tenth of a percent", () => {
    // cost 1, price 8000: 99.9875 % -> 99.99 -> 1000
    expect(priceCostReference([sourceWith({ totalCents: 1, quantity: 1000 })], 8000)).toMatchObject(
      { marginTenthsOfPercent: 1000 },
    );
    // cost 1999, price 2000: 0.05 % is exactly half a tenth -> rounds up to 1
    expect(
      priceCostReference([sourceWith({ totalCents: 1999, quantity: 1000 })], 2000),
    ).toMatchObject({ marginTenthsOfPercent: 1 });
    // cost 3, price 8: 62.5 % exactly
    expect(priceCostReference([sourceWith({ totalCents: 3, quantity: 1000 })], 8)).toMatchObject({
      marginTenthsOfPercent: 625,
    });
    // cost 2, price 3: 33.33 % -> 333
    expect(priceCostReference([sourceWith({ totalCents: 2, quantity: 1000 })], 3)).toMatchObject({
      marginTenthsOfPercent: 333,
    });
  });

  it("is zero when the price equals the cost", () => {
    expect(
      priceCostReference([sourceWith({ totalCents: 500, quantity: 1000 })], 500),
    ).toMatchObject({ marginTenthsOfPercent: 0 });
  });

  it("is a hundred percent when the cost is nothing", () => {
    expect(priceCostReference([sourceWith({ totalCents: 0, quantity: 1000 })], 500)).toMatchObject({
      lastCostCents: 0,
      marginTenthsOfPercent: 1000,
    });
  });

  it("is negative when the price is below the cost, rounding half up", () => {
    // cost 3, price 2: -50 %
    expect(priceCostReference([sourceWith({ totalCents: 3, quantity: 1000 })], 2)).toMatchObject({
      marginTenthsOfPercent: -500,
    });
    // cost 1000, price 999: -0.1001 % -> -1
    expect(
      priceCostReference([sourceWith({ totalCents: 1000, quantity: 1000 })], 999),
    ).toMatchObject({ marginTenthsOfPercent: -1 });
    // cost 2001, price 2000: -0.05 % is exactly half a tenth -> rounds up toward zero, to 0
    expect(
      priceCostReference([sourceWith({ totalCents: 2001, quantity: 1000 })], 2000),
    ).toMatchObject({ marginTenthsOfPercent: 0 });
    // cost 5, price 3: -66.67 % -> -667
    expect(priceCostReference([sourceWith({ totalCents: 5, quantity: 1000 })], 3)).toMatchObject({
      marginTenthsOfPercent: -667,
    });
    // cost 17, price 3: -466.67 % -> -4667
    expect(priceCostReference([sourceWith({ totalCents: 17, quantity: 1000 })], 3)).toMatchObject({
      marginTenthsOfPercent: -4667,
    });
  });

  it("keeps the freight per unit as a value of the reference", () => {
    expect(FREIGHT_PER_UNIT_CENTS).toBe(0);
  });

  it("rounds the last cost within half a cent of the exact cost and totals it with the freight, for every cost", () => {
    fc.assert(
      fc.property(cost, price, (c, p) => {
        const reference = priceCostReference([sourceWith(c)], p);
        const exact = (c.totalCents * 1000) / c.quantity;
        expect(Math.abs((reference?.lastCostCents ?? 0) - exact)).toBeLessThanOrEqual(0.5 + 1e-6);
        expect(reference?.totalCostCents).toBe(
          (reference?.lastCostCents ?? 0) + (reference?.freightPerUnitCents ?? 0),
        );
      }),
    );
  });

  it("keeps the margin within a tenth of the exact ratio for every cost and price", () => {
    fc.assert(
      fc.property(cost, price, (c, p) => {
        const exactCost = (c.totalCents * 1000) / c.quantity;
        const exactTenths = ((p - exactCost) / p) * 1000;
        const margin = priceCostReference([sourceWith(c)], p)?.marginTenthsOfPercent;
        expect(margin).not.toBeNull();
        expect(Math.abs((margin ?? 0) - exactTenths)).toBeLessThanOrEqual(0.5 + 1e-6);
      }),
    );
  });

  it("never gives a margin above a hundred percent", () => {
    fc.assert(
      fc.property(cost, price, (c, p) => {
        expect(priceCostReference([sourceWith(c)], p)?.marginTenthsOfPercent).toBeLessThanOrEqual(
          1000,
        );
      }),
    );
  });
});
