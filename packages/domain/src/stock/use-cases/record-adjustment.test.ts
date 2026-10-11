import { describe, expect, it } from "vitest";
import type { AdjustmentReason, StockDirection } from "../model/stock-movement-reason.js";
import { recordAdjustment } from "./record-adjustment.js";
import { FakeStockStore, FixedClock } from "./test-support/fake-stock-store.js";

const NOON = new Date("2026-09-16T15:50:00.000Z");
const LATER = new Date("2026-09-20T12:00:00.000Z");
const KEY = { productId: "product-1", locationId: "branch-1" };

function storeWithProduct(
  overrides: { saleUnit?: "UNIT" | "KG"; balance?: number } = {},
): FakeStockStore {
  const store = new FakeStockStore();
  store.seedProduct({
    id: "product-1",
    saleUnit: overrides.saleUnit ?? "UNIT",
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
  it("answers not_found for a product that doesn't exist, writing nothing", async () => {
    const store = storeWithProduct();
    const before = store.snapshot();

    const outcome = await adjust(store, { productId: "missing" });

    expect(outcome).toEqual({ kind: "not_found" });
    expect(store.snapshot()).toEqual(before);
  });

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
      "productLots",
      "openTechnicalLot",
      "allocateToLot",
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

  describe("lot allocation", () => {
    function remainingByLot(store: FakeStockStore): Record<string, number> {
      return Object.fromEntries(store.snapshot().lots.map((lot) => [lot.id, lot.remaining]));
    }

    it("takes a negative adjustment from the lots that expire soonest first", async () => {
      const store = storeWithProduct();
      store.seedLot({ ...KEY, id: "late", expiresOn: "2027-06-01", remaining: 4000 });
      store.seedLot({ ...KEY, id: "soon", expiresOn: "2027-01-01", remaining: 1000 });

      await adjust(store, { direction: "subtract", quantity: 2000 });

      expect(store.snapshot().allocations).toEqual([
        { movementId: "movement-1", lotId: "soon", quantity: -1000 },
        { movementId: "movement-1", lotId: "late", quantity: -1000 },
      ]);
    });

    it("assigns what the lots cannot cover to the most recently received lot", async () => {
      const store = storeWithProduct();
      store.seedLot({
        ...KEY,
        id: "older",
        receivedAt: new Date("2026-02-01T00:00:00.000Z"),
        remaining: 1000,
      });
      store.seedLot({
        ...KEY,
        id: "newer",
        purchasedOn: "2026-02-01",
        receivedAt: new Date("2026-03-01T00:00:00.000Z"),
        remaining: 0,
      });

      await adjust(store, { direction: "subtract", quantity: 3000 });

      expect(remainingByLot(store)).toEqual({ older: 0, newer: -2000 });
    });

    it("returns a positive adjustment to the most recently received lot", async () => {
      const store = storeWithProduct();
      store.seedLot({
        ...KEY,
        id: "a-older",
        expiresOn: "2026-12-01",
        receivedAt: new Date("2026-02-01T00:00:00.000Z"),
        remaining: 1000,
      });
      store.seedLot({
        ...KEY,
        id: "b-newer",
        receivedAt: new Date("2026-03-01T00:00:00.000Z"),
        remaining: 500,
      });

      await adjust(store, { direction: "add", quantity: 2000 });

      expect(remainingByLot(store)).toEqual({ "a-older": 1000, "b-newer": 2500 });
      expect(store.snapshot().allocations).toEqual([
        { movementId: "movement-1", lotId: "b-newer", quantity: 2000 },
      ]);
    });

    it("returns a positive adjustment to the technical lot when the product has no other lot", async () => {
      const store = storeWithProduct();
      store.seedLot({ ...KEY, id: "technical", technical: true, remaining: -3000 });

      await adjust(store, { direction: "add", quantity: 2000 });

      expect(remainingByLot(store)).toEqual({ technical: -1000 });
    });

    it("opens a technical lot for a positive adjustment of a product with no lot", async () => {
      const store = storeWithProduct();

      await adjust(store, { direction: "add", quantity: 2000 });

      expect(store.snapshot().lots).toMatchObject([{ technical: true, remaining: 2000 }]);
    });

    it("records no allocation for an adjustment a count already supersedes", async () => {
      const store = storeWithProduct();
      store.seedLot({ ...KEY, id: "stocked", remaining: 5000 });
      store.seedMovement({
        ...KEY,
        kind: "count",
        reason: null,
        delta: 0,
        occurredAt: LATER,
        actorId: "actor-2",
        supersededByCountId: null,
      });

      await adjust(store);

      expect(store.snapshot().allocations).toEqual([]);
      expect(remainingByLot(store)).toEqual({ stocked: 5000 });
    });

    it.each(["openTechnicalLot", "allocateToLot"] as const)(
      "leaves nothing behind when %s fails",
      async (operation) => {
        const store = storeWithProduct();
        const before = store.snapshot();
        store.failingWrites.add(operation);

        await expect(adjust(store)).rejects.toThrow(`${operation} failed`);

        expect(store.snapshot()).toEqual(before);
      },
    );
  });
});
