import { describe, expect, it } from "vitest";
import { registerCount } from "./register-count.js";
import type { CountedLot } from "./stock-store.js";
import { FakeStockStore, FixedClock } from "./test-support/fake-stock-store.js";

const NOW = new Date("2026-09-15T21:40:00.000Z");
const COUNTED_AT = new Date("2026-09-15T21:32:00.000Z");
const BEFORE_COUNT = new Date("2026-09-15T20:00:00.000Z");
const AFTER_COUNT = new Date("2026-09-15T21:35:00.000Z");
const KEY = { productId: "product-1", locationId: "branch-1" };

function storeWithProduct(
  overrides: { saleUnit?: "UNIT" | "KG"; balance?: number } = {},
): FakeStockStore {
  const store = new FakeStockStore();
  store.seedProduct({
    id: "product-1",
    saleUnit: overrides.saleUnit ?? "KG",
  });
  store.seedBalance({ ...KEY, quantity: overrides.balance ?? 12_400 });
  return store;
}

function seedLoss(store: FakeStockStore, occurredAt: Date, delta: number, locationId = "branch-1") {
  return store.seedMovement({
    productId: "product-1",
    locationId,
    kind: "loss",
    reason: "spoiled",
    delta,
    occurredAt,
    actorId: "actor-2",
    supersededByCountId: null,
  });
}

function seedCount(store: FakeStockStore, occurredAt: Date) {
  return store.seedMovement({
    ...KEY,
    kind: "count",
    reason: null,
    delta: 0,
    occurredAt,
    actorId: "actor-2",
    supersededByCountId: null,
  });
}

function count(
  store: FakeStockStore,
  overrides: {
    productId?: string;
    counted?: number;
    lots?: CountedLot[];
    occurredAt?: Date;
  } = {},
) {
  const counted = overrides.counted ?? (overrides.lots ? undefined : 12_150);
  return registerCount(
    { store, clock: new FixedClock(NOW) },
    {
      productId: overrides.productId ?? "product-1",
      locationId: "branch-1",
      ...(counted === undefined ? {} : { counted }),
      ...(overrides.lots ? { lots: overrides.lots } : {}),
      occurredAt: overrides.occurredAt ?? COUNTED_AT,
      actorId: "actor-1",
    },
  );
}

function seedLots(store: FakeStockStore) {
  store.seedLot({
    ...KEY,
    id: "soon",
    expiresOn: "2027-01-01",
    receivedAt: new Date("2026-02-01T12:00:00.000Z"),
    remaining: 4_000,
  });
  store.seedLot({
    ...KEY,
    id: "late",
    expiresOn: "2027-06-01",
    receivedAt: new Date("2026-01-01T12:00:00.000Z"),
    remaining: 6_000,
  });
}

function remainingOf(store: FakeStockStore): Record<string, number> {
  return Object.fromEntries(store.snapshot().lots.map((lot) => [lot.id, lot.remaining]));
}

describe("registerCount", () => {
  it("refuses a count that happened after now, touching nothing", async () => {
    const store = storeWithProduct();
    const before = store.snapshot();

    const outcome = await count(store, { occurredAt: new Date(NOW.getTime() + 1) });

    expect(outcome).toEqual({ kind: "occurred_in_the_future" });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).toEqual([]);
  });

  it("accepts a count that happened right now", async () => {
    const store = storeWithProduct();

    const outcome = await count(store, { occurredAt: NOW });

    expect(outcome).toMatchObject({ kind: "recorded" });
  });

  it("answers not_found for a product that doesn't exist, writing nothing", async () => {
    const store = storeWithProduct();
    const before = store.snapshot();

    const outcome = await count(store, { productId: "missing" });

    expect(outcome).toEqual({ kind: "not_found" });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).toEqual(["lockProductStock"]);
  });

  it("refuses part of a unit of a product sold by the unit, writing nothing", async () => {
    const store = storeWithProduct({ saleUnit: "UNIT" });
    const before = store.snapshot();

    const outcome = await count(store, { counted: 16_500 });

    expect(outcome).toEqual({ kind: "invalid_quantity" });
    expect(store.snapshot()).toEqual(before);
  });

  it("sets the balance to what was counted when nothing happened after the count", async () => {
    const store = storeWithProduct({ balance: 12_400 });
    seedLoss(store, BEFORE_COUNT, -600);

    const outcome = await count(store, { counted: 12_150 });

    expect(outcome).toEqual({
      kind: "recorded",
      movementId: "movement-2",
      expected: 12_400,
      delta: -250,
      balance: 12_150,
      supersededByCountId: null,
    });
    expect(store.balanceOf(KEY)).toBe(12_150);
  });

  it("computes the difference against the balance left after undoing what was applied after the count", async () => {
    const store = storeWithProduct({ balance: 11_400 });
    seedLoss(store, AFTER_COUNT, -1000);
    seedLoss(store, AFTER_COUNT, -300, "branch-2");

    const outcome = await count(store, { counted: 12_150 });

    expect(outcome).toMatchObject({ expected: 12_400, delta: -250, balance: 11_150 });
  });

  it("does not undo a movement already superseded by an earlier count", async () => {
    const store = storeWithProduct({ balance: 11_400 });
    store.seedMovement({
      ...KEY,
      kind: "loss",
      reason: "theft",
      delta: -5000,
      occurredAt: AFTER_COUNT,
      actorId: "actor-2",
      supersededByCountId: "movement-99",
    });

    const outcome = await count(store, { counted: 11_400 });

    expect(outcome).toMatchObject({ expected: 11_400, delta: 0 });
  });

  it("does not undo a movement that happened at the moment of the count", async () => {
    const store = storeWithProduct({ balance: 11_400 });
    seedLoss(store, COUNTED_AT, -1000);

    const outcome = await count(store, { counted: 11_400 });

    expect(outcome).toMatchObject({ expected: 11_400, delta: 0 });
  });

  it("records a count that finds no difference", async () => {
    const store = storeWithProduct({ balance: 24_000 });

    const outcome = await count(store, { counted: 24_000 });

    expect(outcome).toMatchObject({ kind: "recorded", delta: 0, balance: 24_000 });
    expect(store.snapshot().counts).toEqual([
      { movementId: "movement-1", counted: 24_000, expected: 24_000 },
    ]);
  });

  it("records the count as a movement of its difference, dated when it happened", async () => {
    const store = storeWithProduct({ balance: 12_400 });

    await count(store, { counted: 12_150 });

    const after = store.snapshot();
    expect(after.movements).toEqual([
      {
        id: "movement-1",
        ...KEY,
        kind: "count",
        reason: null,
        delta: -250,
        occurredAt: COUNTED_AT,
        actorId: "actor-1",
        supersededByCountId: null,
      },
    ]);
    expect(after.counts).toEqual([{ movementId: "movement-1", counted: 12_150, expected: 12_400 }]);
  });

  it("keeps a count dated before an already registered count without changing the balance", async () => {
    const store = storeWithProduct({ balance: 12_400 });
    const laterCount = seedCount(store, AFTER_COUNT);

    const outcome = await count(store, { counted: 10_000 });

    expect(outcome).toMatchObject({
      kind: "recorded",
      balance: 12_400,
      supersededByCountId: laterCount,
    });
    expect(store.balanceOf(KEY)).toBe(12_400);
    expect(store.snapshot().movements.at(-1)).toMatchObject({ supersededByCountId: laterCount });
    expect(store.operationOrder).not.toContain("addToBalance");
  });

  it("refuses a second count of the product at the same moment, writing nothing", async () => {
    const store = storeWithProduct();
    seedCount(store, COUNTED_AT);
    const before = store.snapshot();

    const outcome = await count(store);

    expect(outcome).toEqual({ kind: "count_at_same_moment" });
    expect(store.snapshot()).toEqual(before);
  });

  it("locks the product's stock before it reads, and reads before it writes", async () => {
    const store = storeWithProduct();

    await count(store);

    expect(store.operationOrder).toEqual([
      "lockProductStock",
      "earliestCountAtOrAfter",
      "appliedDeltaAfter",
      "lotAllocationsAfter",
      "productLots",
      "recordMovement",
      "addToBalance",
      "recordCount",
      "openTechnicalLot",
      "allocateToLot",
    ]);
  });

  it.each(["recordMovement", "recordCount", "addToBalance"] as const)(
    "leaves nothing behind when %s fails",
    async (operation) => {
      const store = storeWithProduct();
      store.failingWrites.add(operation);
      const before = store.snapshot();

      await expect(count(store)).rejects.toThrow(`${operation} failed`);

      expect(store.snapshot()).toEqual(before);
    },
  );
});

describe("registerCount by product on a product with lots", () => {
  it("fills the lots from the latest expiry backwards and empties the rest", async () => {
    const store = storeWithProduct({ balance: 10_000 });
    seedLots(store);

    await count(store, { counted: 7_000 });

    expect(remainingOf(store)).toEqual({ soon: 1_000, late: 6_000 });
    expect(store.snapshot().allocations).toEqual([
      { movementId: "movement-1", lotId: "soon", quantity: -3_000 },
    ]);
  });

  it("gives the excess to the most recently received lot", async () => {
    const store = storeWithProduct({ balance: 10_000 });
    seedLots(store);

    await count(store, { counted: 12_000 });

    expect(remainingOf(store)).toEqual({ soon: 6_000, late: 6_000 });
  });

  it("sets a technical lot that is the product's only lot to the counted quantity", async () => {
    const store = storeWithProduct({ balance: -3_000 });
    store.seedLot({
      ...KEY,
      id: "technical",
      technical: true,
      purchasedOn: null,
      remaining: -3_000,
    });

    await count(store, { counted: 4_000 });

    expect(remainingOf(store)).toEqual({ technical: 4_000 });
  });

  it("sets the technical lot to zero when the bought lots hold the count", async () => {
    const store = storeWithProduct({ balance: 9_000 });
    seedLots(store);
    store.seedLot({
      ...KEY,
      id: "technical",
      technical: true,
      purchasedOn: null,
      remaining: -1_000,
    });

    await count(store, { counted: 10_000 });

    expect(remainingOf(store)).toEqual({ soon: 4_000, late: 6_000, technical: 0 });
  });

  it("opens a technical lot to hold the count of a product with no lot", async () => {
    const store = storeWithProduct({ balance: 0 });

    await count(store, { counted: 4_000 });

    const { lots, allocations } = store.snapshot();
    expect(lots).toMatchObject([{ technical: true, remaining: 4_000 }]);
    expect(allocations).toEqual([
      { movementId: "movement-1", lotId: lots[0]?.id, quantity: 4_000 },
    ]);
  });

  it("opens no technical lot for a product with no lot counted at zero", async () => {
    const store = storeWithProduct({ balance: 0 });

    await count(store, { counted: 0 });

    expect(store.snapshot().lots).toEqual([]);
  });

  it("records no counted lots", async () => {
    const store = storeWithProduct({ balance: 10_000 });
    seedLots(store);

    await count(store, { counted: 7_000 });

    expect(store.snapshot().countedLots).toEqual([]);
  });

  it("keeps what movements after the count took from a lot", async () => {
    const store = storeWithProduct({ balance: 10_000 });
    seedLots(store);
    const sale = store.seedMovement({
      ...KEY,
      kind: "sale",
      reason: null,
      delta: -2_000,
      occurredAt: AFTER_COUNT,
      actorId: "actor-2",
      supersededByCountId: null,
    });
    store.seedAllocation({ movementId: sale, lotId: "soon", quantity: -2_000 });

    await count(store, { counted: 7_000 });

    expect(remainingOf(store)).toEqual({ soon: -1_000, late: 6_000 });
  });

  it("ignores what a movement superseded by a count took from a lot", async () => {
    const store = storeWithProduct({ balance: 10_000 });
    seedLots(store);
    const sale = store.seedMovement({
      ...KEY,
      kind: "sale",
      reason: null,
      delta: -2_000,
      occurredAt: AFTER_COUNT,
      actorId: "actor-2",
      supersededByCountId: "movement-99",
    });
    store.seedAllocation({ movementId: sale, lotId: "soon", quantity: -2_000 });

    await count(store, { counted: 7_000 });

    expect(remainingOf(store)).toEqual({ soon: 1_000, late: 6_000 });
  });

  it("ignores what movements at another branch took from a lot", async () => {
    const store = storeWithProduct({ balance: 10_000 });
    seedLots(store);
    const sale = seedLoss(store, AFTER_COUNT, -2_000, "branch-2");
    store.seedAllocation({ movementId: sale, lotId: "soon", quantity: -2_000 });

    await count(store, { counted: 7_000 });

    expect(remainingOf(store)).toEqual({ soon: 1_000, late: 6_000 });
  });
});

describe("registerCount by lot", () => {
  it("makes the sum of the counted lots the counted quantity", async () => {
    const store = storeWithProduct({ balance: 10_000 });
    seedLots(store);

    const outcome = await count(store, {
      lots: [
        { lotId: "soon", counted: 1_000 },
        { lotId: "late", counted: 2_500 },
      ],
    });

    expect(outcome).toMatchObject({
      kind: "recorded",
      expected: 10_000,
      delta: -6_500,
      balance: 3_500,
    });
    expect(store.snapshot().counts).toEqual([
      { movementId: "movement-1", counted: 3_500, expected: 10_000 },
    ]);
  });

  it("sets each counted lot to its counted quantity and every other lot to zero", async () => {
    const store = storeWithProduct({ balance: 10_500 });
    seedLots(store);
    store.seedLot({ ...KEY, id: "technical", technical: true, purchasedOn: null, remaining: 500 });
    store.seedLot({ ...KEY, id: "other-branch", locationId: "branch-2", remaining: 800 });

    await count(store, { lots: [{ lotId: "soon", counted: 4_500 }] });

    expect(remainingOf(store)).toEqual({
      soon: 4_500,
      late: 0,
      technical: 0,
      "other-branch": 800,
    });
  });

  it("records the counted lots with the count", async () => {
    const store = storeWithProduct({ balance: 10_000 });
    seedLots(store);
    const lots = [
      { lotId: "soon", counted: 1_000 },
      { lotId: "late", counted: 0 },
    ];

    await count(store, { lots });

    expect(store.snapshot().countedLots).toEqual([{ movementId: "movement-1", lots }]);
  });

  it("counts a lot that is in debt", async () => {
    const store = storeWithProduct({ balance: -500 });
    store.seedLot({ ...KEY, id: "debt", remaining: -500 });

    await count(store, { lots: [{ lotId: "debt", counted: 200 }] });

    expect(remainingOf(store)).toEqual({ debt: 200 });
  });

  it("sets a counted lot to its counted quantity minus what later movements took from it", async () => {
    const store = storeWithProduct({ balance: 10_000 });
    seedLots(store);
    const sale = store.seedMovement({
      ...KEY,
      kind: "sale",
      reason: null,
      delta: -2_000,
      occurredAt: AFTER_COUNT,
      actorId: "actor-2",
      supersededByCountId: null,
    });
    store.seedAllocation({ movementId: sale, lotId: "soon", quantity: -2_000 });

    const outcome = await count(store, { lots: [{ lotId: "soon", counted: 5_000 }] });

    expect(outcome).toMatchObject({ expected: 12_000, delta: -7_000, balance: 3_000 });
    expect(remainingOf(store)).toEqual({ soon: 3_000, late: 0 });
  });

  it("accepts a lot that had stock at the moment of a past count and none now", async () => {
    const store = storeWithProduct({ balance: 0 });
    store.seedLot({ ...KEY, id: "sold", remaining: 0 });
    const sale = store.seedMovement({
      ...KEY,
      kind: "sale",
      reason: null,
      delta: -3_000,
      occurredAt: AFTER_COUNT,
      actorId: "actor-2",
      supersededByCountId: null,
    });
    store.seedAllocation({ movementId: sale, lotId: "sold", quantity: -3_000 });

    const outcome = await count(store, { lots: [{ lotId: "sold", counted: 2_000 }] });

    expect(outcome).toMatchObject({ kind: "recorded" });
    expect(remainingOf(store)).toEqual({ sold: -1_000 });
  });

  it("refuses a lot of another product", async () => {
    const store = storeWithProduct();
    seedLots(store);
    store.seedLot({ productId: "product-2", locationId: "branch-1", id: "foreign", remaining: 5 });
    const before = store.snapshot();

    const outcome = await count(store, { lots: [{ lotId: "foreign", counted: 1_000 }] });

    expect(outcome).toEqual({ kind: "invalid_lot" });
    expect(store.snapshot()).toEqual(before);
  });

  it("refuses a lot of another branch", async () => {
    const store = storeWithProduct();
    store.seedLot({ ...KEY, locationId: "branch-2", id: "elsewhere", remaining: 5_000 });

    expect(await count(store, { lots: [{ lotId: "elsewhere", counted: 1_000 }] })).toEqual({
      kind: "invalid_lot",
    });
  });

  it("refuses a lot that does not exist", async () => {
    const store = storeWithProduct();
    seedLots(store);

    expect(await count(store, { lots: [{ lotId: "missing", counted: 1_000 }] })).toEqual({
      kind: "invalid_lot",
    });
  });

  it("refuses the technical lot", async () => {
    const store = storeWithProduct();
    store.seedLot({
      ...KEY,
      id: "technical",
      technical: true,
      purchasedOn: null,
      remaining: 2_000,
    });

    expect(await count(store, { lots: [{ lotId: "technical", counted: 1_000 }] })).toEqual({
      kind: "invalid_lot",
    });
  });

  it("refuses a lot with nothing at the moment of the count", async () => {
    const store = storeWithProduct();
    store.seedLot({ ...KEY, id: "empty", remaining: 0 });

    expect(await count(store, { lots: [{ lotId: "empty", counted: 1_000 }] })).toEqual({
      kind: "invalid_lot",
    });
  });

  it("refuses a lot received after the moment of the count", async () => {
    const store = storeWithProduct({ balance: 3_000 });
    const receipt = store.seedMovement({
      ...KEY,
      kind: "receipt",
      reason: null,
      delta: 3_000,
      occurredAt: AFTER_COUNT,
      actorId: "actor-2",
      supersededByCountId: null,
    });
    store.seedLot({ ...KEY, id: "arrived-later", remaining: 3_000 });
    store.seedAllocation({ movementId: receipt, lotId: "arrived-later", quantity: 3_000 });

    expect(await count(store, { lots: [{ lotId: "arrived-later", counted: 1_000 }] })).toEqual({
      kind: "invalid_lot",
    });
  });

  it("refuses a lot listed twice, writing nothing", async () => {
    const store = storeWithProduct();
    seedLots(store);
    const before = store.snapshot();

    const outcome = await count(store, {
      lots: [
        { lotId: "soon", counted: 1_000 },
        { lotId: "soon", counted: 2_000 },
      ],
    });

    expect(outcome).toEqual({ kind: "repeated_lot" });
    expect(store.snapshot()).toEqual(before);
  });

  it("refuses a lot quantity that is part of a unit for a product sold by the unit", async () => {
    const store = storeWithProduct({ saleUnit: "UNIT", balance: 10_000 });
    seedLots(store);
    const before = store.snapshot();

    const outcome = await count(store, {
      lots: [
        { lotId: "soon", counted: 1_000 },
        { lotId: "late", counted: 1_500 },
      ],
    });

    expect(outcome).toEqual({ kind: "invalid_quantity" });
    expect(store.snapshot()).toEqual(before);
  });

  it("answers not_found for a product that does not exist", async () => {
    const store = storeWithProduct();

    expect(
      await count(store, { productId: "missing", lots: [{ lotId: "soon", counted: 1_000 }] }),
    ).toEqual({ kind: "not_found" });
  });

  it("refuses a lot count that happened at the moment of another count", async () => {
    const store = storeWithProduct();
    seedLots(store);
    seedCount(store, COUNTED_AT);

    expect(await count(store, { lots: [{ lotId: "soon", counted: 1_000 }] })).toEqual({
      kind: "count_at_same_moment",
    });
  });

  it("locks the product's stock before it reads, and reads before it writes", async () => {
    const store = storeWithProduct({ balance: 10_000 });
    seedLots(store);

    await count(store, { lots: [{ lotId: "soon", counted: 1_000 }] });

    expect(store.operationOrder).toEqual([
      "lockProductStock",
      "earliestCountAtOrAfter",
      "appliedDeltaAfter",
      "lotAllocationsAfter",
      "productLots",
      "recordMovement",
      "addToBalance",
      "recordCount",
      "recordCountedLots",
      "allocateToLot",
      "allocateToLot",
    ]);
  });
});

describe("registerCount that is not exactly one of a counted quantity and lots", () => {
  it.each([
    ["both", { counted: 1_000, lots: [{ lotId: "soon", counted: 1_000 }] }],
    ["neither", {}],
    ["no lots in an empty list", { lots: [] }],
  ])("refuses %s, writing nothing", async (_case, input) => {
    const store = storeWithProduct();
    seedLots(store);
    const before = store.snapshot();

    const outcome = await registerCount(
      { store, clock: new FixedClock(NOW) },
      {
        productId: "product-1",
        locationId: "branch-1",
        occurredAt: COUNTED_AT,
        actorId: "actor-1",
        ...input,
      },
    );

    expect(outcome).toEqual({ kind: "ambiguous_count" });
    expect(store.snapshot()).toEqual(before);
  });

  it("counts by product when the list of lots is empty beside a counted quantity", async () => {
    const store = storeWithProduct({ balance: 10_000 });
    seedLots(store);

    const outcome = await registerCount(
      { store, clock: new FixedClock(NOW) },
      {
        productId: "product-1",
        locationId: "branch-1",
        counted: 7_000,
        lots: [],
        occurredAt: COUNTED_AT,
        actorId: "actor-1",
      },
    );

    expect(outcome).toMatchObject({ kind: "recorded", balance: 7_000 });
  });
});

describe("registerCount dated before an already registered count", () => {
  it("leaves every lot as it is", async () => {
    const store = storeWithProduct({ balance: 10_000 });
    seedLots(store);
    seedCount(store, AFTER_COUNT);

    await count(store, { counted: 3_000 });

    expect(remainingOf(store)).toEqual({ soon: 4_000, late: 6_000 });
    expect(store.snapshot().allocations).toEqual([]);
  });

  it("records the counted lots all the same", async () => {
    const store = storeWithProduct({ balance: 10_000 });
    seedLots(store);
    seedCount(store, AFTER_COUNT);
    const lots = [{ lotId: "soon", counted: 1_000 }];

    await count(store, { lots });

    expect(remainingOf(store)).toEqual({ soon: 4_000, late: 6_000 });
    expect(store.snapshot().countedLots).toEqual([{ movementId: "movement-2", lots }]);
  });
});

describe("registerCount when a write to the lots fails", () => {
  it.each(["allocateToLot", "recordCountedLots", "openTechnicalLot"] as const)(
    "leaves nothing behind when %s fails",
    async (operation) => {
      const store = storeWithProduct({ balance: 0 });
      if (operation !== "openTechnicalLot") {
        seedLots(store);
      }
      store.failingWrites.add(operation);
      const before = store.snapshot();

      await expect(
        count(
          store,
          operation === "openTechnicalLot"
            ? { counted: 4_000 }
            : { lots: [{ lotId: "soon", counted: 1_000 }] },
        ),
      ).rejects.toThrow(`${operation} failed`);

      expect(store.snapshot()).toEqual(before);
    },
  );
});
