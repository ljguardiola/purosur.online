import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { FreightLine, FreightToDistribute } from "../../purchasing/index.js";
import { type CostSource, priceCostReference } from "./price-cost-reference.js";

function purchase(
  lineId: string,
  purchasedOn: string,
  recordedAt: string,
  cost = { totalCents: 1000, quantity: 1000 },
  freights: FreightToDistribute[] = [],
): CostSource {
  return {
    kind: "purchase_line",
    lineId,
    purchasedOn,
    recordedAt: new Date(recordedAt),
    cost,
    freights,
  };
}

function purchaseCosting(
  costCents: number,
  lineId: string,
  purchasedOn: string,
  recordedAt: string,
): CostSource {
  return purchase(lineId, purchasedOn, recordedAt, { totalCents: costCents, quantity: 1000 });
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

function initialCountCosting(costCents: number, countedAt: string): CostSource {
  return initialCount(countedAt, { cost: { totalCents: costCents, quantity: 1000 } });
}

function lastCostOf(sources: CostSource[]): number | null {
  return priceCostReference(sources, null)?.lastCostCents ?? null;
}

describe("the last cost source", () => {
  it("is the purchase line with the latest purchase day", () => {
    const older = purchaseCosting(100, "a", "2026-03-01", "2026-03-09T12:00:00Z");
    const newer = purchaseCosting(200, "b", "2026-03-02", "2026-03-02T12:00:00Z");

    expect(lastCostOf([newer, older])).toBe(200);
    expect(lastCostOf([older, newer])).toBe(200);
  });

  it("breaks a tie of purchase days with the latest recorded instant", () => {
    const earlier = purchaseCosting(100, "a", "2026-03-01", "2026-03-01T10:00:00Z");
    const later = purchaseCosting(200, "b", "2026-03-01", "2026-03-01T11:00:00Z");

    expect(lastCostOf([later, earlier])).toBe(200);
    expect(lastCostOf([earlier, later])).toBe(200);
  });

  it("breaks a tie of day and instant with the lower line id", () => {
    const low = purchaseCosting(100, "a", "2026-03-01", "2026-03-01T10:00:00Z");
    const high = purchaseCosting(200, "b", "2026-03-01", "2026-03-01T10:00:00Z");

    expect(lastCostOf([high, low])).toBe(100);
    expect(lastCostOf([low, high])).toBe(100);
  });

  it("is an initial count more recent than the last purchase", () => {
    const bought = purchaseCosting(100, "a", "2026-03-01", "2026-03-01T10:00:00Z");
    const counted = initialCountCosting(200, "2026-03-05T15:00:00Z");

    expect(lastCostOf([bought, counted])).toBe(200);
  });

  it("is the purchase line when it is more recent than the initial count", () => {
    const counted = initialCountCosting(200, "2026-03-01T15:00:00Z");
    const bought = purchaseCosting(100, "a", "2026-03-05", "2026-03-05T10:00:00Z");

    expect(lastCostOf([counted, bought])).toBe(100);
  });

  it("dates an initial count at its Argentina calendar day", () => {
    const countedOnTheFirstInArgentina = initialCountCosting(200, "2026-03-02T01:00:00Z");
    const boughtOnTheSecond = purchaseCosting(100, "a", "2026-03-02", "2026-03-02T00:30:00Z");

    expect(lastCostOf([boughtOnTheSecond, countedOnTheFirstInArgentina])).toBe(100);
  });

  it("compares an initial count and a purchase on the same day by instant", () => {
    const counted = initialCountCosting(200, "2026-03-01T15:00:00Z");
    const boughtBefore = purchaseCosting(100, "a", "2026-03-01", "2026-03-01T14:00:00Z");
    const boughtAfter = purchaseCosting(300, "a", "2026-03-01", "2026-03-01T16:00:00Z");

    expect(lastCostOf([boughtBefore, counted])).toBe(200);
    expect(lastCostOf([boughtAfter, counted])).toBe(300);
  });

  it("prefers the purchase line over an initial count of the same day and instant", () => {
    const counted = initialCountCosting(200, "2026-03-01T15:00:00Z");
    const bought = purchaseCosting(100, "a", "2026-03-01", "2026-03-01T15:00:00Z");

    expect(lastCostOf([counted, bought])).toBe(100);
    expect(lastCostOf([bought, counted])).toBe(100);
  });

  it("keeps the first of two initial counts made at the same instant", () => {
    const first = initialCountCosting(100, "2026-03-01T15:00:00Z");
    const second = initialCountCosting(200, "2026-03-01T15:00:00Z");

    expect(lastCostOf([first, second])).toBe(100);
    expect(lastCostOf([second, first])).toBe(200);
  });

  it("is never a withdrawn initial count", () => {
    const bought = purchaseCosting(100, "a", "2026-03-01", "2026-03-01T10:00:00Z");
    const withdrawn = initialCount("2026-03-05T15:00:00Z", { withdrawn: true });

    expect(lastCostOf([bought, withdrawn])).toBe(100);
    expect(lastCostOf([withdrawn])).toBeNull();
  });

  it("is never an initial count whose cost is missing or incomplete", () => {
    const bought = purchaseCosting(100, "a", "2026-03-01", "2026-03-01T10:00:00Z");
    const incomplete = initialCount("2026-03-05T15:00:00Z", { costIncomplete: true });
    const untyped = initialCount("2026-03-05T15:00:00Z", { cost: null });

    expect(lastCostOf([bought, incomplete])).toBe(100);
    expect(lastCostOf([incomplete])).toBeNull();
    expect(lastCostOf([untyped])).toBeNull();
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

function marginOf(costCents: number, unitPrice: number): number | null | undefined {
  return priceCostReference([sourceWith({ totalCents: costCents, quantity: 1000 })], unitPrice)
    ?.marginTenthsOfPercent;
}

describe("priceCostReference", () => {
  it("has no cost reference without a cost source", () => {
    expect(priceCostReference([], 2500)).toBeNull();
    expect(priceCostReference([initialCount("2026-03-01T10:00:00Z", { cost: null })], 2500)).toBe(
      null,
    );
  });

  it("shows the last cost, no freight, the total cost and the margin", () => {
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

  it("uses the typed reference cost of an initial count", () => {
    expect(priceCostReference([initialCount("2026-03-01T10:00:00Z")], 1000)).toMatchObject({
      lastCostCents: 700,
      marginTenthsOfPercent: 300,
    });
  });

  it("rounds a cost of half a cent per unit up", () => {
    const halfCentAbove500 = { totalCents: 1001, quantity: 2000 };

    expect(priceCostReference([sourceWith(halfCentAbove500)], 1000)).toMatchObject({
      lastCostCents: 501,
      totalCostCents: 501,
    });
  });

  it("rounds a cost of a third of a cent per unit down", () => {
    const thirdOfACentAbove333 = { totalCents: 1000, quantity: 3000 };

    expect(priceCostReference([sourceWith(thirdOfACentAbove333)], 1000)).toMatchObject({
      lastCostCents: 333,
      totalCostCents: 333,
    });
  });

  it("computes the margin from the exact cost, not the rounded one", () => {
    const costOfHalfThePrice = { totalCents: 1001, quantity: 2000 };

    expect(priceCostReference([sourceWith(costOfHalfThePrice)], 1001)).toMatchObject({
      lastCostCents: 501,
      marginTenthsOfPercent: 500,
    });
  });

  it("rounds a margin just under a hundred percent up to it", () => {
    expect(marginOf(1, 8000)).toBe(1000);
  });

  it("rounds a margin of exactly half a tenth of a percent up", () => {
    expect(marginOf(1999, 2000)).toBe(1);
  });

  it("keeps a margin that is a whole tenth of a percent", () => {
    expect(marginOf(3, 8)).toBe(625);
  });

  it("rounds a margin of a third of a tenth of a percent down", () => {
    expect(marginOf(2, 3)).toBe(333);
  });

  it("is zero when the price equals the cost", () => {
    expect(marginOf(500, 500)).toBe(0);
  });

  it("is a hundred percent when the cost is nothing", () => {
    expect(priceCostReference([sourceWith({ totalCents: 0, quantity: 1000 })], 500)).toMatchObject({
      lastCostCents: 0,
      marginTenthsOfPercent: 1000,
    });
  });

  it("is negative when the price is below the cost", () => {
    expect(marginOf(3, 2)).toBe(-500);
    expect(marginOf(5, 3)).toBe(-667);
    expect(marginOf(17, 3)).toBe(-4667);
  });

  it("rounds a negative margin a little over a tenth of a percent to minus one tenth", () => {
    expect(marginOf(1000, 999)).toBe(-1);
  });

  it("rounds a negative margin of exactly half a tenth of a percent up, to zero", () => {
    expect(marginOf(2001, 2000)).toBe(0);
  });

  it("rounds the last cost within half a cent of the exact cost, as its total cost, for every cost", () => {
    fc.assert(
      fc.property(cost, price, (c, p) => {
        const reference = priceCostReference([sourceWith(c)], p);
        const exact = (c.totalCents * 1000) / c.quantity;
        expect(Math.abs((reference?.lastCostCents ?? 0) - exact)).toBeLessThanOrEqual(0.5 + 1e-6);
        expect(reference?.totalCostCents).toBe(reference?.lastCostCents);
        expect(reference?.freightPerUnitCents).toBe(0);
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

function freightLine(id: string, costPaidCents: number, quantity = 1000): FreightLine {
  return { id, costPaidCents, quantity, quantityPerPackage: 1000 };
}

function boughtWithFreights(
  cost: { totalCents: number; quantity: number },
  freights: FreightToDistribute[],
): CostSource {
  return purchase("a", "2026-03-01", "2026-03-01T10:00:00Z", cost, freights);
}

describe("the freight in the cost reference", () => {
  const ownLine = freightLine("a", 1000);

  it("adds the freight per unit to the last cost, and lowers the margin", () => {
    const reference = priceCostReference(
      [
        boughtWithFreights({ totalCents: 1000, quantity: 1000 }, [
          { amountCents: 250, lines: [ownLine] },
        ]),
      ],
      2000,
    );

    expect(reference).toEqual({
      lastCostCents: 1000,
      freightPerUnitCents: 250,
      totalCostCents: 1250,
      marginTenthsOfPercent: 375,
    });
  });

  it("leaves the cost as it is without a freight", () => {
    const reference = priceCostReference(
      [boughtWithFreights({ totalCents: 1000, quantity: 1000 }, [])],
      2000,
    );

    expect(reference).toEqual({
      lastCostCents: 1000,
      freightPerUnitCents: 0,
      totalCostCents: 1000,
      marginTenthsOfPercent: 500,
    });
  });

  it("takes the line's share of the freight, in proportion to its value, over its quantity", () => {
    const line = freightLine("a", 1000, 2000);
    const other = freightLine("b", 2000, 2000);

    const reference = priceCostReference(
      [
        boughtWithFreights({ totalCents: 2000, quantity: 2000 }, [
          { amountCents: 3000, lines: [line, other] },
        ]),
      ],
      null,
    );

    expect(reference).toMatchObject({ freightPerUnitCents: 500, totalCostCents: 1500 });
  });

  it("sums the shares from every freight of the purchase", () => {
    const reference = priceCostReference(
      [
        boughtWithFreights({ totalCents: 1000, quantity: 1000 }, [
          { amountCents: 250, lines: [ownLine] },
          { amountCents: 100, lines: [ownLine] },
        ]),
      ],
      null,
    );

    expect(reference).toMatchObject({ freightPerUnitCents: 350, totalCostCents: 1350 });
  });

  it("rounds the total cost once, from the exact cost and the exact freight", () => {
    const line = freightLine("a", 500, 5000);

    const reference = priceCostReference(
      [
        boughtWithFreights({ totalCents: 2502, quantity: 5000 }, [
          { amountCents: 2, lines: [line] },
        ]),
      ],
      1000,
    );

    expect(reference).toEqual({
      lastCostCents: 500,
      freightPerUnitCents: 0,
      totalCostCents: 501,
      marginTenthsOfPercent: 499,
    });
  });

  it("never carries over to a cost counted rather than bought", () => {
    const bought = boughtWithFreights({ totalCents: 1000, quantity: 1000 }, [
      { amountCents: 250, lines: [ownLine] },
    ]);
    const counted = initialCountCosting(700, "2026-03-05T15:00:00Z");

    expect(priceCostReference([bought, counted], 2000)).toEqual({
      lastCostCents: 700,
      freightPerUnitCents: 0,
      totalCostCents: 700,
      marginTenthsOfPercent: 650,
    });
  });

  it("adds the freight and lowers the margin for every cost, price and freight", () => {
    fc.assert(
      fc.property(
        cost,
        price,
        fc.integer({ min: 1, max: 100_000_000 }),
        fc.integer({ min: 1, max: 1_000_000_000 }),
        (c, p, amountCents, quantity) => {
          const without = priceCostReference([sourceWith(c)], p);
          const line = freightLine("a", 1000, quantity);
          const reference = priceCostReference(
            [boughtWithFreights(c, [{ amountCents, lines: [line] }])],
            p,
          );

          const exactFreight = (amountCents * 1000) / quantity;
          const exactTotal = (c.totalCents * 1000) / c.quantity + exactFreight;
          expect(
            Math.abs((reference?.freightPerUnitCents ?? 0) - exactFreight),
          ).toBeLessThanOrEqual(0.5 + 1e-6);
          expect(Math.abs((reference?.totalCostCents ?? 0) - exactTotal)).toBeLessThanOrEqual(
            0.5 + 1e-6,
          );
          expect(reference?.totalCostCents).toBeGreaterThanOrEqual(without?.totalCostCents ?? 0);
          expect(reference?.lastCostCents).toBe(without?.lastCostCents);
          expect(reference?.marginTenthsOfPercent).toBeLessThanOrEqual(
            without?.marginTenthsOfPercent ?? 0,
          );
          const exactTenths = ((p - exactTotal) / p) * 1000;
          expect(
            Math.abs((reference?.marginTenthsOfPercent ?? 0) - exactTenths),
          ).toBeLessThanOrEqual(0.5 + 1e-6);
        },
      ),
    );
  });
});
