import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  allocatesToLots,
  compareFirstToConsume,
  movementAllocations,
  receiptAllocations,
  restockedReturnAllocations,
  type StockLot,
  voidedMovementAllocations,
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
  it.each([
    "sale",
    "sale_void",
    "return",
    "loss",
    "adjustment",
    "assembly_out",
    "assembly_void",
  ] as const)("allocates a %s by the lots rule", (kind) => {
    expect(allocatesToLots(kind)).toBe(true);
  });

  it.each(["count", "receipt", "assembly_in"] as const)("leaves a %s to its own rule", (kind) => {
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
      lot("older", {
        purchasedOn: "2026-02-01",
        receivedAt: new Date("2026-02-01T00:00:00.000Z"),
        remaining: 1_000,
      }),
      lot("newer", {
        purchasedOn: "2026-03-01",
        receivedAt: new Date("2026-03-01T00:00:00.000Z"),
        remaining: 2_000,
      }),
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
      lot("a-older", { expiresOn: "2026-12-01", receivedAt: new Date("2026-02-01T00:00:00.000Z") }),
      lot("b-newer", { expiresOn: "2027-12-01", receivedAt: new Date("2026-03-01T00:00:00.000Z") }),
    ];

    expect(movementAllocations(lots, 2_000)).toEqual([
      { target: target("b-newer"), quantity: 2_000 },
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
  it("allocates the whole quantity to the new lot when no lot of the product is in debt", () => {
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

  it("carries the debt of every lot in debt, bought or technical, into the new lot and brings each to zero", () => {
    const lots = [
      lot("bought-in-debt", { remaining: -2_000 }),
      lot("stocked", { remaining: 3_000 }),
      lot("technical", { technical: true, remaining: -1_000 }),
    ];

    expect(receiptAllocations("new", lots, 6_000)).toEqual([
      { target: target("new"), quantity: 3_000 },
      { target: target("bought-in-debt"), quantity: 2_000 },
      { target: target("technical"), quantity: 1_000 },
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

  it("brings every lot in debt to zero and leaves every other lot as it is", () => {
    fc.assert(
      fc.property(lotsArbitrary, fc.integer({ min: 1, max: 60 }), (lots, quantity) => {
        const allocations = receiptAllocations("new", lots, quantity);

        for (const row of lots) {
          const allocated = allocations.find(
            (allocation) => allocation.target.kind === "lot" && allocation.target.lotId === row.id,
          );
          expect(row.remaining + (allocated?.quantity ?? 0)).toBe(Math.max(row.remaining, 0));
        }
      }),
    );
  });
});

describe("voidedMovementAllocations", () => {
  it("gives back to each lot exactly what the sale took from it", () => {
    expect(
      voidedMovementAllocations(
        [lot("soon"), lot("late")],
        [
          { lotId: "soon", quantity: -2000 },
          { lotId: "late", quantity: -4000 },
        ],
        6000,
      ),
    ).toEqual([
      { target: target("soon"), quantity: 2000 },
      { target: target("late"), quantity: 4000 },
    ]);
  });

  it("adds up what the sale took from the same lot more than once", () => {
    expect(
      voidedMovementAllocations(
        [lot("soon"), lot("late")],
        [
          { lotId: "soon", quantity: -2000 },
          { lotId: "late", quantity: -1000 },
          { lotId: "soon", quantity: -500 },
        ],
        3500,
      ),
    ).toEqual([
      { target: target("soon"), quantity: 2500 },
      { target: target("late"), quantity: 1000 },
    ]);
  });

  it("skips a lot whose allocations cancel out", () => {
    expect(
      voidedMovementAllocations(
        [lot("soon"), lot("late")],
        [
          { lotId: "soon", quantity: -2000 },
          { lotId: "soon", quantity: 2000 },
          { lotId: "late", quantity: -1000 },
        ],
        1000,
      ),
    ).toEqual([{ target: target("late"), quantity: 1000 }]);
  });

  it("gives what no allocation of the sale covers to the most recently received lot", () => {
    const lots = [
      lot("older", { receivedAt: new Date("2026-01-01T12:00:00.000Z") }),
      lot("newest", { receivedAt: new Date("2026-09-01T12:00:00.000Z") }),
    ];

    expect(voidedMovementAllocations(lots, [], 3000)).toEqual([
      { target: target("newest"), quantity: 3000 },
    ]);
  });

  it("opens a technical lot for what the sale's allocations don't cover when the product has no lot", () => {
    expect(voidedMovementAllocations([], [], 3000)).toEqual([
      { target: { kind: "new_technical_lot" }, quantity: 3000 },
    ]);
  });

  it("opens no technical lot when the sale's allocations cover the whole void", () => {
    expect(voidedMovementAllocations([], [{ lotId: "sold-from", quantity: -3000 }], 3000)).toEqual([
      { target: target("sold-from"), quantity: 3000 },
    ]);
  });

  it("adds what the sale's allocations don't cover to the same lot they give back to", () => {
    expect(
      voidedMovementAllocations([lot("only")], [{ lotId: "only", quantity: -2000 }], 3000),
    ).toEqual([{ target: target("only"), quantity: 3000 }]);
  });

  it("allocates exactly the void's quantity, to each lot at most once", () => {
    fc.assert(
      fc.property(
        lotsArbitrary,
        fc.array(fc.integer({ min: -60, max: 60 }), { maxLength: 6 }),
        fc.integer({ min: 1, max: 60 }),
        (lots, quantities, delta) => {
          const originalAllocations = quantities.map((quantity, index) => ({
            lotId: `lot-${index % Math.max(lots.length, 1)}`,
            quantity,
          }));

          const allocations = voidedMovementAllocations(lots, originalAllocations, delta);

          expect(total(allocations)).toBe(delta);
          expect(new Set(targetKeys(allocations)).size).toBe(allocations.length);
          expect(allocations.every((allocation) => allocation.quantity !== 0)).toBe(true);
        },
      ),
    );
  });
});

describe("restockedReturnAllocations", () => {
  const lots = [
    lot("soon", { expiresOn: "2026-11-01" }),
    lot("middle", { expiresOn: "2026-12-01" }),
    lot("late", { expiresOn: "2027-01-01" }),
    lot("never", { expiresOn: null }),
  ];

  it("returns to the lot that expires latest first, up to what the sale took from it", () => {
    expect(
      restockedReturnAllocations(
        lots,
        [
          { lotId: "soon", quantity: -3000 },
          { lotId: "late", quantity: -2000 },
          { lotId: "middle", quantity: -1000 },
        ],
        [],
        4000,
      ),
    ).toEqual([
      { target: target("late"), quantity: 2000 },
      { target: target("middle"), quantity: 1000 },
      { target: target("soon"), quantity: 1000 },
    ]);
  });

  it("treats a lot without expiry as the one that expires latest", () => {
    expect(
      restockedReturnAllocations(
        lots,
        [
          { lotId: "late", quantity: -2000 },
          { lotId: "never", quantity: -2000 },
        ],
        [],
        3000,
      ),
    ).toEqual([
      { target: target("never"), quantity: 2000 },
      { target: target("late"), quantity: 1000 },
    ]);
  });

  it("breaks an expiry tie by the later purchase, then the greater id", () => {
    const tied = [
      lot("a", { expiresOn: "2026-12-01", purchasedOn: "2026-02-01" }),
      lot("b", { expiresOn: "2026-12-01", purchasedOn: "2026-03-01" }),
      lot("c", { expiresOn: "2026-12-01", purchasedOn: "2026-03-01" }),
    ];

    expect(
      restockedReturnAllocations(
        tied,
        [
          { lotId: "a", quantity: -1000 },
          { lotId: "b", quantity: -1000 },
          { lotId: "c", quantity: -1000 },
        ],
        [],
        3000,
      ).map((allocation) => allocation.target),
    ).toEqual([target("c"), target("b"), target("a")]);
  });

  it("adds up what the sale took from the same lot more than once", () => {
    expect(
      restockedReturnAllocations(
        lots,
        [
          { lotId: "late", quantity: -1000 },
          { lotId: "late", quantity: -500 },
        ],
        [],
        1500,
      ),
    ).toEqual([{ target: target("late"), quantity: 1500 }]);
  });

  it("leaves out of each lot what earlier returns already gave back", () => {
    expect(
      restockedReturnAllocations(
        lots,
        [
          { lotId: "soon", quantity: -3000 },
          { lotId: "late", quantity: -2000 },
        ],
        [{ lotId: "late", quantity: 1500 }],
        1000,
      ),
    ).toEqual([
      { target: target("late"), quantity: 500 },
      { target: target("soon"), quantity: 500 },
    ]);
  });

  it("offers no capacity in a lot that earlier returns filled exactly", () => {
    expect(
      restockedReturnAllocations(
        lots,
        [
          { lotId: "soon", quantity: -3000 },
          { lotId: "late", quantity: -2000 },
        ],
        [{ lotId: "late", quantity: 2000 }],
        1000,
      ),
    ).toEqual([{ target: target("soon"), quantity: 1000 }]);
  });

  it("offers no capacity in a lot that earlier returns filled beyond the sale", () => {
    expect(
      restockedReturnAllocations(
        lots,
        [
          { lotId: "soon", quantity: -3000 },
          { lotId: "late", quantity: -2000 },
        ],
        [{ lotId: "late", quantity: 2500 }],
        1000,
      ),
    ).toEqual([{ target: target("soon"), quantity: 1000 }]);
  });

  it("orders a lot the product no longer lists after every listed one", () => {
    expect(
      restockedReturnAllocations(
        lots,
        [
          { lotId: "gone", quantity: -2000 },
          { lotId: "soon", quantity: -2000 },
        ],
        [],
        3000,
      ),
    ).toEqual([
      { target: target("soon"), quantity: 2000 },
      { target: target("gone"), quantity: 1000 },
    ]);
  });

  it("gives what the sale's lots cannot take to the most recently received lot", () => {
    const received = [
      lot("older", { receivedAt: new Date("2026-01-01T12:00:00.000Z") }),
      lot("newest", { receivedAt: new Date("2026-09-01T12:00:00.000Z") }),
    ];

    expect(restockedReturnAllocations(received, [], [], 3000)).toEqual([
      { target: target("newest"), quantity: 3000 },
    ]);
  });

  it("adds the remainder to the lot the sale took from when it is the most recently received", () => {
    const received = [
      lot("older", { receivedAt: new Date("2026-01-01T12:00:00.000Z") }),
      lot("newest", { receivedAt: new Date("2026-09-01T12:00:00.000Z") }),
    ];

    expect(
      restockedReturnAllocations(received, [{ lotId: "newest", quantity: -2000 }], [], 3000),
    ).toEqual([{ target: target("newest"), quantity: 3000 }]);
  });

  it("opens a technical lot for the remainder when the product has no lot", () => {
    expect(restockedReturnAllocations([], [], [], 3000)).toEqual([
      { target: { kind: "new_technical_lot" }, quantity: 3000 },
    ]);
  });
});

describe("restockedReturnAllocations for any sale and any quantity", () => {
  const saleAllocations = fc.array(
    fc.record({ lotIndex: fc.nat(5), quantity: fc.integer({ min: 1, max: 40 }) }),
    { maxLength: 8 },
  );
  const returns = fc.array(
    fc.record({ lotIndex: fc.nat(5), quantity: fc.integer({ min: 1, max: 40 }) }),
    { maxLength: 4 },
  );

  function scenario(
    lots: readonly StockLot[],
    sold: readonly { lotIndex: number; quantity: number }[],
    returned: readonly { lotIndex: number; quantity: number }[],
  ) {
    const lotId = (index: number) => `lot-${index % Math.max(lots.length, 1)}`;
    const saleRows = sold.map(({ lotIndex, quantity }) => ({
      lotId: lotId(lotIndex),
      quantity: -quantity,
    }));
    const returnedRows = returned.map(({ lotIndex, quantity }) => ({
      lotId: lotId(lotIndex),
      quantity,
    }));
    const capacity = new Map<string, number>();
    for (const row of saleRows) {
      capacity.set(row.lotId, (capacity.get(row.lotId) ?? 0) - row.quantity);
    }
    for (const row of returnedRows) {
      capacity.set(row.lotId, (capacity.get(row.lotId) ?? 0) - row.quantity);
    }
    for (const [id, value] of capacity) {
      capacity.set(id, Math.max(value, 0));
    }
    return { saleRows, returnedRows, capacity };
  }

  it("allocates exactly the returned quantity", () => {
    fc.assert(
      fc.property(
        lotsArbitrary,
        saleAllocations,
        returns,
        fc.integer({ min: 1, max: 200 }),
        (lots, sold, returned, delta) => {
          const { saleRows, returnedRows } = scenario(lots, sold, returned);

          const allocations = restockedReturnAllocations(lots, saleRows, returnedRows, delta);

          expect(total(allocations)).toBe(delta);
          expect(allocations.every((allocation) => allocation.quantity > 0)).toBe(true);
          expect(new Set(targetKeys(allocations)).size).toBe(allocations.length);
        },
      ),
    );
  });

  it("gives no lot more than the sale took from it less what earlier returns gave back", () => {
    fc.assert(
      fc.property(
        lotsArbitrary,
        saleAllocations,
        returns,
        fc.integer({ min: 1, max: 200 }),
        (lots, sold, returned, delta) => {
          const { saleRows, returnedRows, capacity } = scenario(lots, sold, returned);
          const room = [...capacity.values()].reduce((sum, value) => sum + value, 0);
          fc.pre(delta <= room);

          const allocations = restockedReturnAllocations(lots, saleRows, returnedRows, delta);

          for (const allocation of allocations) {
            const id = allocation.target.kind === "lot" ? allocation.target.lotId : "";
            expect(allocation.quantity).toBeLessThanOrEqual(capacity.get(id) ?? 0);
          }
        },
      ),
    );
  });

  it("fills every lot that expires later before it gives anything to a lot", () => {
    fc.assert(
      fc.property(
        lotsArbitrary,
        saleAllocations,
        returns,
        fc.integer({ min: 1, max: 200 }),
        (lots, sold, returned, delta) => {
          const { saleRows, returnedRows, capacity } = scenario(lots, sold, returned);
          const room = [...capacity.values()].reduce((sum, value) => sum + value, 0);
          fc.pre(delta <= room);

          const allocations = restockedReturnAllocations(lots, saleRows, returnedRows, delta);
          const given = new Map(
            allocations.map((allocation) => [
              allocation.target.kind === "lot" ? allocation.target.lotId : "",
              allocation.quantity,
            ]),
          );
          const latestFirst = lots
            .filter((row) => (capacity.get(row.id) ?? 0) > 0)
            .sort((a, b) => compareFirstToConsume(b, a));
          latestFirst.forEach((row, position) => {
            if ((given.get(row.id) ?? 0) > 0) {
              for (const later of latestFirst.slice(0, position)) {
                expect(given.get(later.id)).toBe(capacity.get(later.id));
              }
            }
          });
        },
      ),
    );
  });
});
