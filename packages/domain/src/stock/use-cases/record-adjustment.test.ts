import { describe, expect, it } from "vitest";
import type { AdjustmentReason, StockDirection } from "../model/stock-movement-reason.js";
import { recordAdjustment } from "./record-adjustment.js";
import { FakeStockStore, FixedClock } from "./test-support/fake-stock-store.js";

const NOON = new Date("2026-09-16T15:50:00.000Z");
const LATER = new Date("2026-09-20T12:00:00.000Z");
const KEY = { productId: "product-1", locationId: "branch-1" };

function storeWithProduct(
  overrides: { active?: boolean; saleUnit?: "UNIT" | "KG"; balance?: number } = {},
): FakeStockStore {
  const store = new FakeStockStore();
  store.seedProduct({
    id: "product-1",
    saleUnit: overrides.saleUnit ?? "UNIT",
    active: overrides.active ?? true,
  });
  store.seedBalance({ ...KEY, quantity: overrides.balance ?? 19_000 });
  return store;
}

function adjust(
  store: FakeStockStore,
  overrides: {
    productId?: string;
    reason?: AdjustmentReason;
    direction?: StockDirection;
    quantity?: number;
  } = {},
) {
  return recordAdjustment(
    { store, clock: new FixedClock(NOON) },
    {
      productId: overrides.productId ?? "product-1",
      locationId: "branch-1",
      reason: overrides.reason ?? "purchase_correction",
      direction: overrides.direction ?? "add",
      quantity: overrides.quantity ?? 12_000,
      actorId: "actor-1",
    },
  );
}

describe("recordAdjustment", () => {
  it.each([
    ["doesn't exist", "missing", true],
    ["is inactive", "product-1", false],
  ])(
    "answers not_found for a product that %s, writing nothing",
    async (_case, productId, active) => {
      const store = storeWithProduct({ active });
      const before = store.snapshot();

      const outcome = await adjust(store, { productId });

      expect(outcome).toEqual({ kind: "not_found" });
      expect(store.snapshot()).toEqual(before);
    },
  );

  it("refuses to add stock returned to a supplier, writing nothing", async () => {
    const store = storeWithProduct();
    const before = store.snapshot();

    const outcome = await adjust(store, { reason: "supplier_return", direction: "add" });

    expect(outcome).toEqual({ kind: "direction_not_allowed" });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).toEqual([]);
  });

  it("refuses part of a unit of a product sold by the unit, writing nothing", async () => {
    const store = storeWithProduct({ saleUnit: "UNIT" });
    const before = store.snapshot();

    const outcome = await adjust(store, { quantity: 500 });

    expect(outcome).toEqual({ kind: "invalid_quantity" });
    expect(store.snapshot()).toEqual(before);
  });

  it("adds the quantity in the add direction", async () => {
    const store = storeWithProduct({ balance: 19_000 });

    const outcome = await adjust(store, { direction: "add", quantity: 12_000 });

    expect(outcome).toEqual({
      kind: "recorded",
      movementId: "movement-1",
      balance: 31_000,
      supersededByCountId: null,
    });
  });

  it("subtracts stock returned to a supplier", async () => {
    const store = storeWithProduct({ balance: 19_000 });

    const outcome = await adjust(store, {
      reason: "supplier_return",
      direction: "subtract",
      quantity: 4000,
    });

    expect(outcome).toMatchObject({ kind: "recorded", balance: 15_000 });
  });

  it("records the adjustment as a movement with its reason, its moment and who registered it", async () => {
    const store = storeWithProduct({ saleUnit: "KG" });

    await adjust(store, { reason: "batch_correction", direction: "subtract", quantity: 250 });

    expect(store.snapshot().movements).toEqual([
      {
        id: "movement-1",
        ...KEY,
        kind: "adjustment",
        reason: "batch_correction",
        delta: -250,
        occurredAt: NOON,
        actorId: "actor-1",
        supersededByCountId: null,
      },
    ]);
  });

  it("locks the product's stock before it looks for a count, then writes", async () => {
    const store = storeWithProduct();

    await adjust(store);

    expect(store.operationOrder).toEqual([
      "lockProductStock",
      "earliestCountAtOrAfter",
      "recordMovement",
      "addToBalance",
    ]);
  });

  it("keeps an adjustment dated before a registered count without changing the balance", async () => {
    const store = storeWithProduct({ balance: 19_000 });
    const countId = store.seedMovement({
      ...KEY,
      kind: "count",
      reason: null,
      delta: 0,
      occurredAt: LATER,
      actorId: "actor-2",
      supersededByCountId: null,
    });

    const outcome = await adjust(store);

    expect(outcome).toMatchObject({ balance: 19_000, supersededByCountId: countId });
    expect(store.balanceOf(KEY)).toBe(19_000);
  });

  it("leaves nothing behind when updating the balance fails", async () => {
    const store = storeWithProduct();
    store.failingWrites.add("addToBalance");
    const before = store.snapshot();

    await expect(adjust(store)).rejects.toThrow("addToBalance failed");

    expect(store.snapshot()).toEqual(before);
  });
});
