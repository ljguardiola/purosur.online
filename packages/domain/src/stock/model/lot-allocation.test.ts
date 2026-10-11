import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  allocatesToLots,
  movementAllocations,
  receiptAllocations,
  type StockLot,
} from "./lot-allocation.js";

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

describe("allocatesToLots", () => {
  it.each(["sale", "loss", "adjustment"] as const)("allocates a %s by the lots rule", (kind) => {
    expect(allocatesToLots(kind)).toBe(true);
  });

  it.each(["count", "receipt"] as const)("leaves a %s to its own rule", (kind) => {
    expect(allocatesToLots(kind)).toBe(false);
  });
});

describe("movementAllocations when stock is reduced", () => {
  it("takes from the lot expiring soonest first", () => {
    const lots = [
      lot("late", { expiresOn: "2027-06-01", remaining: 5_000 }),
      lot("soon", { expiresOn: "2027-01-01", remaining: 5_000 }),
    ];

    expect(movementAllocations(lots, -7_000)).toEqual([
      { target: target("soon"), quantity: -5_000 },
      { target: target("late"), quantity: -2_000 },
    ]);
  });

  it("takes lots with no expiry after every lot that expires", () => {
    const lots = [
      lot("none", { expiresOn: null, purchasedOn: "2025-01-01", remaining: 5_000 }),
      lot("dated", { expiresOn: "2030-01-01", remaining: 5_000 }),
    ];

    expect(movementAllocations(lots, -6_000)).toEqual([
      { target: target("dated"), quantity: -5_000 },
      { target: target("none"), quantity: -1_000 },
    ]);
  });

  it("breaks an expiry tie by the earliest purchase date, a missing one last", () => {
    const lots = [
      lot("no-date", { expiresOn: "2027-01-01", purchasedOn: null, remaining: 1_000 }),
      lot("newer", { expiresOn: "2027-01-01", purchasedOn: "2026-05-01", remaining: 1_000 }),
      lot("older", { expiresOn: "2027-01-01", purchasedOn: "2026-02-01", remaining: 1_000 }),
    ];

    expect(movementAllocations(lots, -3_000).map((allocation) => allocation.target)).toEqual([
      target("older"),
      target("newer"),
      target("no-date"),
    ]);
  });

  it("breaks a full tie by the lowest id", () => {
    const lots = [lot("lot-b", { remaining: 1_000 }), lot("lot-a", { remaining: 1_000 })];

    expect(movementAllocations(lots, -2_000).map((allocation) => allocation.target)).toEqual([
      target("lot-a"),
      target("lot-b"),
    ]);
  });

  it("skips lots with nothing remaining and lots in debt", () => {
    const lots = [
      lot("empty", { expiresOn: "2026-12-01", remaining: 0 }),
      lot("in-debt", { expiresOn: "2026-12-02", remaining: -500 }),
      lot("stocked", { expiresOn: "2027-01-01", remaining: 4_000 }),
    ];

    expect(movementAllocations(lots, -1_000)).toEqual([
      { target: target("stocked"), quantity: -1_000 },
    ]);
  });

  it("consumes the technical lot after every lot, since it has no expiry nor purchase date", () => {
    const lots = [
      lot("technical", { technical: true, expiresOn: null, purchasedOn: null, remaining: 2_000 }),
      lot("bought", { expiresOn: null, purchasedOn: "2026-03-01", remaining: 2_000 }),
    ];

    expect(movementAllocations(lots, -3_000)).toEqual([
      { target: target("bought"), quantity: -2_000 },
      { target: target("technical"), quantity: -1_000 },
    ]);
  });

  it("assigns the shortfall to the most recently received lot, which goes negative", () => {
    const lots = [
      lot("older", { receivedAt: new Date("2026-02-01T00:00:00.000Z"), remaining: 1_000 }),
      lot("newer", { receivedAt: new Date("2026-03-01T00:00:00.000Z"), remaining: 2_000 }),
    ];

    expect(movementAllocations(lots, -5_000)).toEqual([
      { target: target("older"), quantity: -1_000 },
      { target: target("newer"), quantity: -4_000 },
    ]);
  });

  it("breaks a tie of reception moments for the shortfall by the highest id", () => {
    const received = new Date("2026-03-01T00:00:00.000Z");
    const lots = [
      lot("lot-a", { receivedAt: received, remaining: 0 }),
      lot("lot-b", { receivedAt: received, remaining: 0 }),
    ];

    expect(movementAllocations(lots, -1_000)).toEqual([
      { target: target("lot-b"), quantity: -1_000 },
    ]);
  });

  it("prefers a lot that was bought over the technical lot for the shortfall", () => {
    const lots = [
      lot("technical", {
        technical: true,
        expiresOn: null,
        purchasedOn: null,
        receivedAt: new Date("2030-01-01T00:00:00.000Z"),
        remaining: 0,
      }),
      lot("bought", { receivedAt: new Date("2026-01-01T00:00:00.000Z"), remaining: 0 }),
    ];

    expect(movementAllocations(lots, -1_000)).toEqual([
      { target: target("bought"), quantity: -1_000 },
    ]);
  });

  it("uses the technical lot for the shortfall when no lot was bought", () => {
    const lots = [lot("technical", { technical: true, remaining: -500 })];

    expect(movementAllocations(lots, -1_000)).toEqual([
      { target: target("technical"), quantity: -1_000 },
    ]);
  });

  it("asks for a technical lot when the product has no lot", () => {
    expect(movementAllocations([], -1_000)).toEqual([
      { target: { kind: "new_technical_lot" }, quantity: -1_000 },
    ]);
  });

  it("records one allocation for a lot that is both consumed and takes the shortfall", () => {
    const lots = [lot("only", { remaining: 3_000 })];

    expect(movementAllocations(lots, -5_000)).toEqual([
      { target: target("only"), quantity: -5_000 },
    ]);
  });
});

describe("movementAllocations when stock grows", () => {
  it("returns the quantity to the most recently received lot", () => {
    const lots = [
      lot("older", { receivedAt: new Date("2026-02-01T00:00:00.000Z") }),
      lot("newer", { receivedAt: new Date("2026-03-01T00:00:00.000Z") }),
    ];

    expect(movementAllocations(lots, 2_000)).toEqual([
      { target: target("newer"), quantity: 2_000 },
    ]);
  });

  it("returns the quantity to the technical lot when the product has no other lot", () => {
    const lots = [lot("technical", { technical: true })];

    expect(movementAllocations(lots, 2_000)).toEqual([
      { target: target("technical"), quantity: 2_000 },
    ]);
  });

  it("asks for a technical lot when the product has no lot", () => {
    expect(movementAllocations([], 2_000)).toEqual([
      { target: { kind: "new_technical_lot" }, quantity: 2_000 },
    ]);
  });

  it("allocates nothing for a movement that changes nothing", () => {
    expect(movementAllocations([lot("any")], 0)).toEqual([]);
  });
});

describe("receiptAllocations", () => {
  it("allocates the whole quantity to the new lot when the product has no technical lot", () => {
    expect(receiptAllocations("new", [lot("old")], 6_000)).toEqual([
      { target: target("new"), quantity: 6_000 },
    ]);
  });

  it("carries the technical lot's debt into the new lot and brings the technical lot to zero", () => {
    const lots = [lot("technical", { technical: true, remaining: -2_000 })];

    expect(receiptAllocations("new", lots, 6_000)).toEqual([
      { target: target("new"), quantity: 4_000 },
      { target: target("technical"), quantity: 2_000 },
    ]);
  });

  it("leaves a positive technical lot as it is", () => {
    const lots = [lot("technical", { technical: true, remaining: 2_000 })];

    expect(receiptAllocations("new", lots, 6_000)).toEqual([
      { target: target("new"), quantity: 6_000 },
    ]);
  });

  it("leaves an empty technical lot as it is", () => {
    const lots = [lot("technical", { technical: true, remaining: 0 })];

    expect(receiptAllocations("new", lots, 6_000)).toEqual([
      { target: target("new"), quantity: 6_000 },
    ]);
  });

  it("does not regularize a debt of a lot that was bought", () => {
    const lots = [lot("bought", { remaining: -2_000 })];

    expect(receiptAllocations("new", lots, 6_000)).toEqual([
      { target: target("new"), quantity: 6_000 },
    ]);
  });

  it("allocates nothing to the new lot when the debt equals what was received", () => {
    const lots = [lot("technical", { technical: true, remaining: -6_000 })];

    expect(receiptAllocations("new", lots, 6_000)).toEqual([
      { target: target("technical"), quantity: 6_000 },
    ]);
  });

  it("leaves the new lot in debt when what was received does not cover the technical lot's", () => {
    const lots = [lot("technical", { technical: true, remaining: -8_000 })];

    expect(receiptAllocations("new", lots, 6_000)).toEqual([
      { target: target("new"), quantity: -2_000 },
      { target: target("technical"), quantity: 8_000 },
    ]);
  });
});

const EXPIRIES = [null, "2026-11-01", "2026-12-01", "2027-01-01"];
const PURCHASES = [null, "2026-01-01", "2026-02-01", "2026-03-01"];

const lotArbitrary = fc.record({
  technical: fc.boolean(),
  expiresOn: fc.constantFrom(...EXPIRIES),
  purchasedOn: fc.constantFrom(...PURCHASES),
  receivedAt: fc.integer({ min: 0, max: 5 }).map((hours) => new Date(hours * 3_600_000)),
  remaining: fc.integer({ min: -20, max: 40 }),
});

const lotsArbitrary = fc.array(lotArbitrary, { maxLength: 6 }).map((rows) => {
  let technicalSeen = false;
  return rows.map((row, index): StockLot => {
    const technical = row.technical && !technicalSeen;
    technicalSeen = technicalSeen || technical;
    return {
      ...row,
      technical,
      id: `lot-${index}`,
      ...(technical && { expiresOn: null, purchasedOn: null }),
    };
  });
});

function total(allocations: readonly { quantity: number }[]): number {
  return allocations.reduce((sum, allocation) => sum + allocation.quantity, 0);
}

function targetKeys(allocations: ReturnType<typeof movementAllocations>): string[] {
  return allocations.map((allocation) =>
    allocation.target.kind === "lot" ? allocation.target.lotId : "new_technical_lot",
  );
}

function fefoKey(row: StockLot): string {
  return [row.expiresOn ?? "9999", row.purchasedOn ?? "9999", row.id].join("|");
}

describe("movementAllocations for any lots and any quantity", () => {
  const delta = fc.integer({ min: -60, max: 60 });

  it("allocates exactly the movement's quantity, once per lot and never nothing", () => {
    fc.assert(
      fc.property(lotsArbitrary, delta, (lots, change) => {
        const allocations = movementAllocations(lots, change);

        expect(total(allocations)).toBe(change);
        expect(new Set(targetKeys(allocations)).size).toBe(allocations.length);
        expect(allocations.every((allocation) => allocation.quantity !== 0)).toBe(true);
        expect(
          allocations.every((allocation) => Math.sign(allocation.quantity) === Math.sign(change)),
        ).toBe(true);
      }),
    );
  });

  it("takes from a lot only up to what it has, but for the one that takes the shortfall", () => {
    fc.assert(
      fc.property(lotsArbitrary, fc.integer({ min: -60, max: -1 }), (lots, change) => {
        const allocations = movementAllocations(lots, change);
        const overdrawn = allocations.filter((allocation) => {
          const row = lots.find(
            (candidate) =>
              allocation.target.kind === "lot" && candidate.id === allocation.target.lotId,
          );
          return row === undefined || -allocation.quantity > Math.max(row.remaining, 0);
        });

        expect(overdrawn.length).toBeLessThanOrEqual(1);
        if (overdrawn.length === 1) {
          for (const row of lots.filter((candidate) => candidate.remaining > 0)) {
            const taken = allocations.find(
              (allocation) =>
                allocation.target.kind === "lot" && allocation.target.lotId === row.id,
            );
            expect(taken?.quantity).toBeLessThanOrEqual(-row.remaining);
          }
        }
      }),
    );
  });

  it("touches a lot only after emptying every lot that comes before it in FEFO order", () => {
    fc.assert(
      fc.property(lotsArbitrary, fc.integer({ min: -60, max: -1 }), (lots, change) => {
        const allocations = movementAllocations(lots, change);
        const taken = new Map(
          allocations.flatMap((allocation) =>
            allocation.target.kind === "lot"
              ? [[allocation.target.lotId, allocation.quantity]]
              : [],
          ),
        );
        const stocked = lots.filter((row) => row.remaining > 0);

        for (const later of stocked.filter((row) => taken.has(row.id))) {
          for (const earlier of stocked.filter((row) => fefoKey(row) < fefoKey(later))) {
            expect(taken.get(earlier.id) ?? 0).toBeLessThanOrEqual(-earlier.remaining);
          }
        }
      }),
    );
  });

  it("sends a stock increase to a single lot", () => {
    fc.assert(
      fc.property(lotsArbitrary, fc.integer({ min: 1, max: 60 }), (lots, change) => {
        expect(movementAllocations(lots, change)).toHaveLength(1);
      }),
    );
  });
});

describe("receiptAllocations for any lots and any quantity", () => {
  it("allocates exactly what was received, once per lot and never nothing", () => {
    fc.assert(
      fc.property(lotsArbitrary, fc.integer({ min: 1, max: 60 }), (lots, quantity) => {
        const allocations = receiptAllocations("new", lots, quantity);

        expect(total(allocations)).toBe(quantity);
        expect(new Set(targetKeys(allocations)).size).toBe(allocations.length);
        expect(allocations.every((allocation) => allocation.quantity !== 0)).toBe(true);
      }),
    );
  });
});
