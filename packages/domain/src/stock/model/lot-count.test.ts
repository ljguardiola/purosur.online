import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { PlannedLotAllocation, StockLot } from "./lot-allocation.js";
import {
  countByLotAllocations,
  countByProductAllocations,
  isCountableByLot,
  lotsAtMoment,
} from "./lot-count.js";

function lot(id: string, overrides: Partial<StockLot> = {}): StockLot {
  return {
    id,
    technical: false,
    expiresOn: null,
    purchasedOn: "2026-01-01",
    receivedAt: new Date("2026-01-01T12:00:00.000Z"),
    remaining: 10_000,
    ...overrides,
  };
}

function target(lotId: string) {
  return { kind: "lot", lotId } as const;
}

function applied(lots: readonly StockLot[], allocations: readonly PlannedLotAllocation[]) {
  const result = new Map(lots.map((candidate) => [candidate.id, candidate.remaining]));
  for (const { target: to, quantity } of allocations) {
    if (to.kind === "lot") {
      result.set(to.lotId, (result.get(to.lotId) ?? 0) + quantity);
    }
  }
  return result;
}

function total(values: Iterable<number>): number {
  return [...values].reduce((sum, value) => sum + value, 0);
}

describe("lotsAtMoment", () => {
  it("takes back from each lot what movements after the moment allocated to it", () => {
    const lots = [lot("a", { remaining: 3_000 }), lot("b", { remaining: 8_000 })];

    const atMoment = lotsAtMoment(
      lots,
      new Map([
        ["a", -2_000],
        ["b", 500],
      ]),
    );

    expect(atMoment.map(({ id, remaining }) => ({ id, remaining }))).toEqual([
      { id: "a", remaining: 5_000 },
      { id: "b", remaining: 7_500 },
    ]);
  });

  it("leaves a lot nothing allocated to after the moment as it is", () => {
    const lots = [lot("a", { remaining: 3_000 })];

    expect(lotsAtMoment(lots, new Map())).toEqual(lots);
  });

  it("leaves a lot received after the moment with nothing at the moment", () => {
    const lots = [lot("late", { remaining: 4_000 })];

    expect(lotsAtMoment(lots, new Map([["late", 4_000]]))[0]?.remaining).toBe(0);
  });

  it("keeps every other field of the lot", () => {
    const original = lot("a", { expiresOn: "2027-01-01", remaining: 3_000 });

    expect(lotsAtMoment([original], new Map([["a", 1_000]]))).toEqual([
      { ...original, remaining: 2_000 },
    ]);
  });
});

describe("isCountableByLot", () => {
  it("accepts a bought lot with stock at the moment", () => {
    expect(isCountableByLot(lot("a", { remaining: 1 }))).toBe(true);
  });

  it("accepts a bought lot in debt", () => {
    expect(isCountableByLot(lot("a", { remaining: -1 }))).toBe(true);
  });

  it("refuses a lot with nothing at the moment", () => {
    expect(isCountableByLot(lot("a", { remaining: 0 }))).toBe(false);
  });

  it("refuses the technical lot", () => {
    expect(isCountableByLot(lot("a", { technical: true, remaining: 5_000 }))).toBe(false);
  });
});

describe("countByProductAllocations", () => {
  it("fills the lots from the latest expiry backwards, each up to what it holds", () => {
    const lots = [
      lot("soon", { expiresOn: "2027-01-01", remaining: 4_000 }),
      lot("late", { expiresOn: "2027-06-01", remaining: 5_000 }),
    ];

    expect(countByProductAllocations(lots, 6_000)).toEqual([
      { target: target("soon"), quantity: -3_000 },
    ]);
  });

  it("fills from the latest expiry whatever order the lots are listed in", () => {
    const lots = [
      lot("late", { expiresOn: "2027-06-01", remaining: 5_000 }),
      lot("soon", { expiresOn: "2027-01-01", remaining: 4_000 }),
    ];

    expect(countByProductAllocations(lots, 6_000)).toEqual([
      { target: target("soon"), quantity: -3_000 },
    ]);
  });

  it("fills a lot with no expiry before any lot that expires", () => {
    const lots = [
      lot("dated", { expiresOn: "2027-01-01", remaining: 4_000 }),
      lot("none", { expiresOn: null, remaining: 4_000 }),
    ];

    expect(countByProductAllocations(lots, 5_000)).toEqual([
      { target: target("dated"), quantity: -3_000 },
    ]);
  });

  it("sets the lots left over to zero", () => {
    const lots = [
      lot("soon", { expiresOn: "2027-01-01", remaining: 4_000 }),
      lot("late", { expiresOn: "2027-06-01", remaining: 5_000 }),
    ];

    expect(countByProductAllocations(lots, 0)).toEqual([
      { target: target("soon"), quantity: -4_000 },
      { target: target("late"), quantity: -5_000 },
    ]);
  });

  it("gives the excess to the most recently received bought lot", () => {
    const lots = [
      lot("old", { expiresOn: "2027-01-01", remaining: 1_000, receivedAt: new Date("2026-01-01") }),
      lot("new", { expiresOn: "2027-06-01", remaining: 1_000, receivedAt: new Date("2026-03-01") }),
    ];

    expect(countByProductAllocations(lots, 5_000)).toEqual([
      { target: target("new"), quantity: 3_000 },
    ]);
  });

  it("sets the technical lot to zero when bought lots hold the count", () => {
    const lots = [
      lot("tech", { technical: true, purchasedOn: null, remaining: 2_000 }),
      lot("bought", { remaining: 5_000 }),
    ];

    expect(countByProductAllocations(lots, 5_000)).toEqual([
      { target: target("tech"), quantity: -2_000 },
    ]);
  });

  it("sets a product whose only lot is technical to the counted quantity", () => {
    const lots = [lot("tech", { technical: true, purchasedOn: null, remaining: 2_000 })];

    expect(countByProductAllocations(lots, 7_000)).toEqual([
      { target: target("tech"), quantity: 5_000 },
    ]);
  });

  it("opens a technical lot for a product with no lot", () => {
    expect(countByProductAllocations([], 7_000)).toEqual([
      { target: { kind: "new_technical_lot" }, quantity: 7_000 },
    ]);
  });

  it("allocates nothing to a product with no lot counted at zero", () => {
    expect(countByProductAllocations([], 0)).toEqual([]);
  });

  it("brings a lot in debt up to what the count gives it", () => {
    const lots = [lot("debt", { remaining: -1_000 })];

    expect(countByProductAllocations(lots, 3_000)).toEqual([
      { target: target("debt"), quantity: 4_000 },
    ]);
  });

  it("does not let a lot in debt hold part of the count before the excess", () => {
    const lots = [
      lot("debt", {
        expiresOn: "2027-06-01",
        remaining: -1_000,
        receivedAt: new Date("2026-01-01"),
      }),
      lot("ok", { expiresOn: "2027-01-01", remaining: 2_000, receivedAt: new Date("2026-02-01") }),
    ];

    expect(countByProductAllocations(lots, 2_500)).toEqual([
      { target: target("debt"), quantity: 1_000 },
      { target: target("ok"), quantity: 500 },
    ]);
  });
});

describe("countByLotAllocations", () => {
  it("sets each counted lot to its counted quantity and every other lot to zero", () => {
    const lots = [
      lot("a", { remaining: 4_000 }),
      lot("b", { remaining: 5_000 }),
      lot("tech", { technical: true, purchasedOn: null, remaining: 1_000 }),
    ];

    expect(countByLotAllocations(lots, new Map([["a", 6_000]]))).toEqual([
      { target: target("a"), quantity: 2_000 },
      { target: target("b"), quantity: -5_000 },
      { target: target("tech"), quantity: -1_000 },
    ]);
  });

  it("allocates nothing to a lot already at its counted quantity", () => {
    const lots = [lot("a", { remaining: 4_000 })];

    expect(countByLotAllocations(lots, new Map([["a", 4_000]]))).toEqual([]);
  });
});

const boughtLotArbitrary = fc.record({
  expiresOn: fc.option(fc.constantFrom("2027-01-01", "2027-06-01", "2028-01-01"), { nil: null }),
  receivedDay: fc.integer({ min: 0, max: 20 }),
  remaining: fc.integer({ min: -5_000, max: 20_000 }),
});

const lotsArbitrary = fc
  .record({
    technicalRemaining: fc.option(fc.integer({ min: -5_000, max: 20_000 }), { nil: null }),
    bought: fc.array(boughtLotArbitrary, { maxLength: 5 }),
  })
  .map(({ technicalRemaining, bought }) => [
    ...(technicalRemaining === null
      ? []
      : [lot("technical", { technical: true, purchasedOn: null, remaining: technicalRemaining })]),
    ...bought.map(({ expiresOn, receivedDay, remaining }, index) =>
      lot(`bought-${index}`, {
        expiresOn,
        receivedAt: new Date(Date.UTC(2026, 0, 1 + receivedDay)),
        remaining,
      }),
    ),
  ]);

const countedArbitrary = fc.integer({ min: 0, max: 50_000 });

function plannedLotIds(allocations: readonly PlannedLotAllocation[]): string[] {
  return allocations.flatMap(({ target: to }) => (to.kind === "lot" ? [to.lotId] : []));
}

describe("countByProductAllocations generated", () => {
  it("leaves the product's lots adding up to the counted quantity", () => {
    fc.assert(
      fc.property(lotsArbitrary, countedArbitrary, (lots, counted) => {
        const allocations = countByProductAllocations(lots, counted);
        const opened = allocations
          .filter(({ target: to }) => to.kind === "new_technical_lot")
          .reduce((sum, { quantity }) => sum + quantity, 0);

        expect(total(applied(lots, allocations).values()) + opened).toBe(counted);
      }),
    );
  });

  it("leaves no lot below zero", () => {
    fc.assert(
      fc.property(lotsArbitrary, countedArbitrary, (lots, counted) => {
        const allocations = countByProductAllocations(lots, counted);

        expect([...applied(lots, allocations).values()].every((value) => value >= 0)).toBe(true);
        expect(
          allocations
            .filter(({ target: to }) => to.kind === "new_technical_lot")
            .every(({ quantity }) => quantity > 0),
        ).toBe(true);
      }),
    );
  });

  it("raises a lot above what it holds only for the excess", () => {
    fc.assert(
      fc.property(lotsArbitrary, countedArbitrary, (lots, counted) => {
        const after = applied(lots, countByProductAllocations(lots, counted));
        const raised = lots.filter(
          (candidate) => (after.get(candidate.id) ?? 0) > Math.max(0, candidate.remaining),
        );
        const boughtHolding = lots
          .filter((candidate) => !candidate.technical)
          .reduce((sum, candidate) => sum + Math.max(0, candidate.remaining), 0);

        expect(raised.length).toBeLessThanOrEqual(1);
        if (counted <= boughtHolding) {
          expect(raised).toEqual([]);
        }
      }),
    );
  });

  it("allocates at most once to a lot and never a zero", () => {
    fc.assert(
      fc.property(lotsArbitrary, countedArbitrary, (lots, counted) => {
        const allocations = countByProductAllocations(lots, counted);
        const ids = plannedLotIds(allocations);

        expect(new Set(ids).size).toBe(ids.length);
        expect(allocations.every(({ quantity }) => quantity !== 0)).toBe(true);
      }),
    );
  });
});

describe("countByLotAllocations generated", () => {
  it("leaves each counted lot at its counted quantity and every other lot at zero", () => {
    fc.assert(
      fc.property(
        lotsArbitrary,
        fc.array(fc.integer({ min: 0, max: 20_000 }), { maxLength: 6 }),
        (lots, quantities) => {
          const counted = new Map(
            lots
              .filter((candidate) => !candidate.technical)
              .slice(0, quantities.length)
              .map((candidate, index) => [candidate.id, quantities[index] ?? 0] as const),
          );

          const allocations = countByLotAllocations(lots, counted);
          const after = applied(lots, allocations);

          for (const candidate of lots) {
            expect(after.get(candidate.id)).toBe(counted.get(candidate.id) ?? 0);
          }
          const ids = plannedLotIds(allocations);
          expect(new Set(ids).size).toBe(ids.length);
          expect(allocations.every(({ quantity }) => quantity !== 0)).toBe(true);
        },
      ),
    );
  });
});
