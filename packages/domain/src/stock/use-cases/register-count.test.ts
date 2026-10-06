import { describe, expect, it } from "vitest";
import { registerCount } from "./register-count.js";
import { FakeStockStore, FixedClock } from "./test-support/fake-stock-store.js";

const NOW = new Date("2026-09-15T21:40:00.000Z");
const COUNTED_AT = new Date("2026-09-15T21:32:00.000Z");
const BEFORE_COUNT = new Date("2026-09-15T20:00:00.000Z");
const AFTER_COUNT = new Date("2026-09-15T21:35:00.000Z");
const KEY = { productId: "product-1", locationId: "branch-1" };

function storeWithProduct(
  overrides: { active?: boolean; saleUnit?: "UNIT" | "KG"; balance?: number } = {},
): FakeStockStore {
  const store = new FakeStockStore();
  store.seedProduct({
    id: "product-1",
    saleUnit: overrides.saleUnit ?? "KG",
    active: overrides.active ?? true,
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
  overrides: { productId?: string; counted?: number; occurredAt?: Date } = {},
) {
  return registerCount(
    { store, clock: new FixedClock(NOW) },
    {
      productId: overrides.productId ?? "product-1",
      locationId: "branch-1",
      counted: overrides.counted ?? 12_150,
      occurredAt: overrides.occurredAt ?? COUNTED_AT,
      actorId: "actor-1",
    },
  );
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

  it("records the count of a deactivated product's leftover stock", async () => {
    const store = storeWithProduct({ active: false, balance: 12_400 });

    const outcome = await count(store, { counted: 12_150 });

    expect(outcome).toMatchObject({ kind: "recorded", expected: 12_400, balance: 12_150 });
    expect(store.balanceOf(KEY)).toBe(12_150);
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
      "recordMovement",
      "addToBalance",
      "recordCount",
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
