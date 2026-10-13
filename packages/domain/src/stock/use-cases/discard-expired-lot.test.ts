import { describe, expect, it } from "vitest";
import { type DiscardExpiredLotInput, discardExpiredLot } from "./discard-expired-lot.js";
import { FakeStockStore, FixedClock } from "./test-support/fake-stock-store.js";

const NOON = new Date("2026-10-13T15:00:00.000Z");
const KEY = { productId: "product-1", locationId: "branch-1" };

function storeWithLots(): FakeStockStore {
  const store = new FakeStockStore();
  store.seedProduct({ id: "product-1", saleUnit: "UNIT" });
  store.seedBalance({ ...KEY, quantity: 10_000 });
  store.seedLot({ ...KEY, id: "expired", expiresOn: "2026-10-01", remaining: 3000 });
  store.seedLot({ ...KEY, id: "other", expiresOn: "2026-09-01", remaining: 2000 });
  return store;
}

function discard(
  store: FakeStockStore,
  overrides: Partial<DiscardExpiredLotInput> & { now?: Date } = {},
) {
  const { now, ...input } = overrides;
  return discardExpiredLot(
    { store, clock: new FixedClock(now ?? NOON) },
    { lotId: "expired", locationId: "branch-1", actorId: "actor-1", ...input },
  );
}

describe("discardExpiredLot", () => {
  it("discards the whole remaining quantity of an expired lot", async () => {
    const store = storeWithLots();

    const outcome = await discard(store);

    expect(outcome).toEqual({
      kind: "discarded",
      movementId: "movement-1",
      quantity: 3000,
      balance: 7000,
      supersededByCountId: null,
    });
    expect(store.balanceOf(KEY)).toBe(7000);
  });

  it("records a loss with the expired reason, its moment and who discarded it", async () => {
    const store = storeWithLots();

    await discard(store);

    expect(store.snapshot().movements).toEqual([
      {
        id: "movement-1",
        ...KEY,
        kind: "loss",
        reason: "expired",
        delta: -3000,
        occurredAt: NOON,
        actorId: "actor-1",
        supersededByCountId: null,
      },
    ]);
  });

  it("allocates the whole quantity to the chosen lot even when another lot expires earlier", async () => {
    const store = storeWithLots();

    await discard(store);

    expect(store.snapshot().allocations).toEqual([
      { movementId: "movement-1", lotId: "expired", quantity: -3000 },
    ]);
    expect(store.snapshot().lots.map((lot) => [lot.id, lot.remaining])).toEqual([
      ["expired", 0],
      ["other", 2000],
    ]);
  });

  it("answers not_found for a lot that doesn't exist, writing nothing", async () => {
    const store = storeWithLots();
    const before = store.snapshot();

    const outcome = await discard(store, { lotId: "missing" });

    expect(outcome).toEqual({ kind: "not_found" });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).toEqual(["lotProduct"]);
  });

  it("answers not_found for a lot of another location, writing nothing", async () => {
    const store = storeWithLots();
    const before = store.snapshot();

    const outcome = await discard(store, { locationId: "branch-2" });

    expect(outcome).toEqual({ kind: "not_found" });
    expect(store.snapshot()).toEqual(before);
  });

  it("answers not_found for a lot withdrawn from the stock", async () => {
    const store = storeWithLots();
    store.seedLot({
      ...KEY,
      id: "withdrawn",
      expiresOn: "2026-10-01",
      remaining: 1000,
      withdrawn: true,
    });

    const outcome = await discard(store, { lotId: "withdrawn" });

    expect(outcome).toEqual({ kind: "not_found" });
  });

  it("answers not_found when the lot's product has no stock to lock", async () => {
    const store = new FakeStockStore();
    store.seedLot({ ...KEY, id: "expired", expiresOn: "2026-10-01", remaining: 3000 });

    const outcome = await discard(store);

    expect(outcome).toEqual({ kind: "not_found" });
    expect(store.snapshot().movements).toEqual([]);
  });

  it("refuses a lot that expires today, writing nothing", async () => {
    const store = storeWithLots();
    store.seedLot({ ...KEY, id: "today", expiresOn: "2026-10-13", remaining: 1000 });
    const before = store.snapshot();

    const outcome = await discard(store, { lotId: "today" });

    expect(outcome).toEqual({ kind: "not_expired" });
    expect(store.snapshot()).toEqual(before);
  });

  it("refuses a lot that doesn't expire, writing nothing", async () => {
    const store = storeWithLots();
    store.seedLot({ ...KEY, id: "forever", expiresOn: null, remaining: 1000 });
    const before = store.snapshot();

    const outcome = await discard(store, { lotId: "forever" });

    expect(outcome).toEqual({ kind: "not_expired" });
    expect(store.snapshot()).toEqual(before);
  });

  it("takes today as the Argentine calendar day", async () => {
    const store = storeWithLots();
    store.seedLot({ ...KEY, id: "yesterday-there", expiresOn: "2026-10-13", remaining: 1000 });

    const lateEvening = await discard(store, {
      lotId: "yesterday-there",
      now: new Date("2026-10-14T01:00:00.000Z"),
    });
    const nextMorning = await discard(store, {
      lotId: "yesterday-there",
      now: new Date("2026-10-14T03:00:00.000Z"),
    });

    expect(lateEvening).toEqual({ kind: "not_expired" });
    expect(nextMorning).toMatchObject({ kind: "discarded", quantity: 1000 });
  });

  it.each([0, -500])(
    "answers nothing_left for an expired lot with %s remaining",
    async (remaining) => {
      const store = storeWithLots();
      store.seedLot({ ...KEY, id: "empty", expiresOn: "2026-10-01", remaining });
      const before = store.snapshot();

      const outcome = await discard(store, { lotId: "empty" });

      expect(outcome).toEqual({ kind: "nothing_left" });
      expect(store.snapshot()).toEqual(before);
    },
  );

  it("discards a lot only once", async () => {
    const store = storeWithLots();

    await discard(store);
    const second = await discard(store);

    expect(second).toEqual({ kind: "nothing_left" });
    expect(store.snapshot().movements).toHaveLength(1);
  });

  it("locks the product's stock before it reads the lots, then looks for a count and writes", async () => {
    const store = storeWithLots();

    await discard(store);

    expect(store.operationOrder).toEqual([
      "lotProduct",
      "lockProductStock",
      "productLots",
      "earliestCountAtOrAfter",
      "recordMovement",
      "addToBalance",
      "allocateToLot",
    ]);
    expect(store.lockedProducts).toEqual(["product-1"]);
  });

  it("keeps a discard dated at or before a registered count without moving the balance nor the lot", async () => {
    const store = storeWithLots();
    const countId = store.seedMovement({
      ...KEY,
      kind: "count",
      reason: null,
      delta: 0,
      occurredAt: NOON,
      actorId: "actor-2",
      supersededByCountId: null,
    });

    const outcome = await discard(store);

    expect(outcome).toEqual({
      kind: "discarded",
      movementId: "movement-2",
      quantity: 3000,
      balance: 10_000,
      supersededByCountId: countId,
    });
    expect(store.balanceOf(KEY)).toBe(10_000);
    expect(store.snapshot().allocations).toEqual([]);
    expect(store.snapshot().lots.find((lot) => lot.id === "expired")?.remaining).toBe(3000);
  });

  it.each(["recordMovement", "addToBalance", "allocateToLot"] as const)(
    "leaves nothing behind when %s fails",
    async (operation) => {
      const store = storeWithLots();
      store.failingWrites.add(operation);
      const before = store.snapshot();

      await expect(discard(store)).rejects.toThrow(`${operation} failed`);

      expect(store.snapshot()).toEqual(before);
    },
  );
});
