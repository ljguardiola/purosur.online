import { describe, expect, it } from "vitest";
import { recordLoss } from "./record-loss.js";
import { FakeStockStore, FixedClock } from "./test-support/fake-stock-store.js";

const NOON = new Date("2026-09-16T15:50:00.000Z");
const EARLIER = new Date("2026-09-10T12:00:00.000Z");
const KEY = { productId: "product-1", locationId: "branch-1" };

function storeWithProduct(
  overrides: { saleUnit?: "UNIT" | "KG"; balance?: number } = {},
): FakeStockStore {
  const store = new FakeStockStore();
  store.seedProduct({ id: "decoy", saleUnit: "UNIT" });
  store.seedProduct({
    id: "product-1",
    saleUnit: overrides.saleUnit ?? "UNIT",
  });
  store.seedBalance({ ...KEY, quantity: overrides.balance ?? 24_000 });
  store.seedBalance({ productId: "product-1", locationId: "branch-2", quantity: 5000 });
  return store;
}

function lose(
  store: FakeStockStore,
  overrides: { productId?: string; quantity?: number; now?: Date } = {},
) {
  return recordLoss(
    { store, clock: new FixedClock(overrides.now ?? NOON) },
    {
      productId: overrides.productId ?? "product-1",
      locationId: "branch-1",
      reason: "broken_or_spilled",
      quantity: overrides.quantity ?? 1000,
      actorId: "actor-1",
    },
  );
}

describe("recordLoss", () => {
  it("answers not_found for a product that doesn't exist, writing nothing", async () => {
    const store = storeWithProduct();
    const before = store.snapshot();

    const outcome = await lose(store, { productId: "missing" });

    expect(outcome).toEqual({ kind: "not_found" });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).toEqual(["lockProductStock"]);
  });

  it("refuses part of a unit of a product sold by the unit, writing nothing", async () => {
    const store = storeWithProduct({ saleUnit: "UNIT" });
    const before = store.snapshot();

    const outcome = await lose(store, { quantity: 1500 });

    expect(outcome).toEqual({ kind: "invalid_quantity" });
    expect(store.snapshot()).toEqual(before);
  });

  it("subtracts the lost quantity from the product's balance in its branch only", async () => {
    const store = storeWithProduct({ balance: 24_000 });

    const outcome = await lose(store, { quantity: 1000 });

    expect(outcome).toEqual({
      kind: "recorded",
      movementId: "movement-1",
      balance: 23_000,
      supersededByCountId: null,
    });
    expect(store.balanceOf(KEY)).toBe(23_000);
    expect(store.balanceOf({ productId: "product-1", locationId: "branch-2" })).toBe(5000);
  });

  it("records the loss as a movement with its reason, its moment and who registered it", async () => {
    const store = storeWithProduct({ saleUnit: "KG" });

    await lose(store, { quantity: 1200 });

    expect(store.snapshot().movements).toEqual([
      {
        id: "movement-1",
        ...KEY,
        kind: "loss",
        reason: "broken_or_spilled",
        delta: -1200,
        occurredAt: NOON,
        actorId: "actor-1",
        supersededByCountId: null,
      },
    ]);
  });

  it("lets the balance go negative", async () => {
    const store = storeWithProduct({ balance: 0 });

    const outcome = await lose(store, { quantity: 4000 });

    expect(outcome).toMatchObject({ kind: "recorded", balance: -4000 });
  });

  it("locks the product's stock before it looks for a count, then writes", async () => {
    const store = storeWithProduct();

    await lose(store);

    expect(store.operationOrder).toEqual([
      "lockProductStock",
      "earliestCountAtOrAfter",
      "recordMovement",
      "addToBalance",
    ]);
  });

  it("keeps a loss dated at or before a registered count without changing the balance", async () => {
    const store = storeWithProduct({ balance: 24_000 });
    const countId = store.seedMovement({
      ...KEY,
      kind: "count",
      reason: null,
      delta: 0,
      occurredAt: NOON,
      actorId: "actor-2",
      supersededByCountId: null,
    });

    const outcome = await lose(store, { quantity: 1000, now: NOON });

    expect(outcome).toEqual({
      kind: "recorded",
      movementId: "movement-2",
      balance: 24_000,
      supersededByCountId: countId,
    });
    expect(store.balanceOf(KEY)).toBe(24_000);
    expect(store.snapshot().movements.at(-1)).toMatchObject({ supersededByCountId: countId });
    expect(store.operationOrder).not.toContain("addToBalance");
  });

  it("applies a loss dated after every registered count", async () => {
    const store = storeWithProduct({ balance: 24_000 });
    store.seedMovement({
      ...KEY,
      kind: "count",
      reason: null,
      delta: 0,
      occurredAt: EARLIER,
      actorId: "actor-2",
      supersededByCountId: null,
    });

    const outcome = await lose(store, { quantity: 1000 });

    expect(outcome).toMatchObject({ balance: 23_000, supersededByCountId: null });
  });

  it.each(["recordMovement", "addToBalance"] as const)(
    "leaves nothing behind when %s fails",
    async (operation) => {
      const store = storeWithProduct();
      store.failingWrites.add(operation);
      const before = store.snapshot();

      await expect(lose(store)).rejects.toThrow(`${operation} failed`);

      expect(store.snapshot()).toEqual(before);
    },
  );
});
