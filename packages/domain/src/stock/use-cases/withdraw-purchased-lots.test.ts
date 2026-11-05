import { describe, expect, it } from "vitest";
import type { FakeStockStore } from "./test-support/fake-stock-store.js";
import {
  ACTOR,
  BRANCH,
  countOf,
  leaveLotBy,
  RECEIVED_AT,
  storeWithReceivedAndSplitLine,
  storeWithReceivedLine,
  YERBA,
} from "./test-support/purchased-line-scenario.js";
import { withdrawPurchasedLots } from "./withdraw-purchased-lots.js";

function withdraw(store: FakeStockStore, overrides = {}) {
  return store.transaction((tx) =>
    withdrawPurchasedLots(tx, {
      locationId: BRANCH,
      purchaseLineId: "line-1",
      actorId: ACTOR,
      ...overrides,
    }),
  );
}

function lot(store: FakeStockStore, id: string) {
  const found = store.snapshot().lots.find((row) => row.id === id);
  if (!found) {
    throw new Error(`lot ${id} does not exist`);
  }
  return found;
}

describe("withdrawPurchasedLots", () => {
  it("takes every unit of the line's lots out of the balance and the lots, and withdraws the lots", async () => {
    const store = await storeWithReceivedAndSplitLine();

    const outcome = await withdraw(store);

    expect(outcome).toEqual({ kind: "withdrawn" });
    expect(store.balanceOf(YERBA)).toBe(5_000);
    expect(lot(store, "lot-1")).toMatchObject({ remaining: 0, withdrawn: true });
    expect(lot(store, "lot-split")).toMatchObject({ remaining: 0, withdrawn: true });
  });

  it("records one receipt of the negative total, dated when the line was received and carrying the line", async () => {
    const store = await storeWithReceivedAndSplitLine();

    await withdraw(store);

    const state = store.snapshot();
    expect(state.movements.at(-1)).toEqual({
      id: "movement-3",
      ...YERBA,
      kind: "receipt",
      reason: null,
      purchaseLineId: "line-1",
      delta: -24_000,
      occurredAt: RECEIVED_AT,
      actorId: ACTOR,
      supersededByCountId: null,
    });
    expect(state.movements).toHaveLength(3);
    expect(state.allocations.slice(-2)).toEqual([
      { movementId: "movement-3", lotId: "lot-1", quantity: -21_000 },
      { movementId: "movement-3", lotId: "lot-split", quantity: -3_000 },
    ]);
  });

  it("allocates nothing to a lot with no units in it", async () => {
    const store = await storeWithReceivedLine();
    store.seedLot({
      id: "lot-empty",
      ...YERBA,
      purchaseLineId: "line-1",
      splitFromLotId: "lot-1",
      remaining: 0,
    });

    await withdraw(store);

    expect(store.snapshot().allocations.map(({ lotId }) => lotId)).toEqual(["lot-1", "lot-1"]);
    expect(lot(store, "lot-empty").withdrawn).toBe(true);
  });

  it("stops the withdrawn lots from being the line's lots", async () => {
    const store = await storeWithReceivedLine();
    await withdraw(store);
    const before = store.snapshot();

    expect(await withdraw(store)).toEqual({ kind: "not_found" });
    expect(store.snapshot()).toEqual(before);
  });

  it("locks the product's stock before it reads the movements of the lots or changes anything", async () => {
    const store = await storeWithReceivedAndSplitLine();
    store.operationOrder.length = 0;

    await withdraw(store);

    expect(store.operationOrder).toEqual([
      "lotsOfPurchaseLines",
      "lockProductStock",
      "receiptInstantOfPurchaseLine",
      "earliestCountAtOrAfter",
      "movementsAllocatedToLots",
      "purchasedLotFacts",
      "recordMovement",
      "addToBalance",
      "allocateToLot",
      "allocateToLot",
      "withdrawPurchasedLots",
    ]);
  });

  it("refuses when a count of the product was taken after the line was received, changing nothing", async () => {
    const store = await storeWithReceivedAndSplitLine();
    countOf(store, YERBA, new Date("2026-03-20T10:00:00.000Z"));
    const before = store.snapshot();

    expect(await withdraw(store)).toEqual({ kind: "counted_since_receipt" });
    expect(store.snapshot()).toEqual(before);
  });

  it("refuses a count taken at the very instant the line was received", async () => {
    const store = await storeWithReceivedLine();
    countOf(store, YERBA, RECEIVED_AT);

    expect(await withdraw(store)).toEqual({ kind: "counted_since_receipt" });
  });

  it("is not stopped by a count taken before the line was received", async () => {
    const store = await storeWithReceivedLine();
    countOf(store, YERBA, new Date("2026-03-01T10:00:00.000Z"));

    expect(await withdraw(store)).toEqual({ kind: "withdrawn" });
  });

  it.each(["sale", "adjustment"] as const)(
    "refuses when a %s took units out of a lot of the line, changing nothing",
    async (kind) => {
      const store = await storeWithReceivedAndSplitLine();
      await leaveLotBy(store, kind, -1_000, "lot-split");
      const before = store.snapshot();

      expect(await withdraw(store)).toEqual({ kind: "units_left_lot" });
      expect(store.snapshot()).toEqual(before);
    },
  );

  it("refuses when units left the lot and came back, since they did leave", async () => {
    const store = await storeWithReceivedLine();
    await leaveLotBy(store, "sale", -1_000);
    await leaveLotBy(store, "return", 1_000);
    const before = store.snapshot();

    expect(await withdraw(store)).toEqual({ kind: "units_left_lot" });
    expect(store.snapshot()).toEqual(before);
  });

  it("answers the count before units that left the lot", async () => {
    const store = await storeWithReceivedLine();
    await leaveLotBy(store, "sale", -1_000);
    countOf(store, YERBA, new Date("2026-03-20T10:00:00.000Z"));

    expect(await withdraw(store)).toEqual({ kind: "counted_since_receipt" });
  });

  it("answers not found when the line created no lot in the branch", async () => {
    const store = await storeWithReceivedLine();
    const before = store.snapshot();

    expect(await withdraw(store, { purchaseLineId: "line-other" })).toEqual({ kind: "not_found" });
    expect(await withdraw(store, { locationId: "branch-2" })).toEqual({ kind: "not_found" });
    expect(store.snapshot()).toEqual(before);
  });

  it("answers not found when a lot split from the line is all there is of it", async () => {
    const store = await storeWithReceivedLine();
    store.seedLot({
      id: "lot-only-split",
      ...YERBA,
      purchaseLineId: "line-9",
      splitFromLotId: "lot-9",
    });
    store.seedMovement({
      ...YERBA,
      kind: "receipt",
      reason: null,
      purchaseLineId: "line-9",
      delta: 1_000,
      occurredAt: RECEIVED_AT,
      actorId: "person-1",
      supersededByCountId: null,
    });

    expect(await withdraw(store, { purchaseLineId: "line-9" })).toEqual({ kind: "not_found" });
  });

  it("answers not found when the lot's product is gone", async () => {
    const store = await storeWithReceivedLine();
    store.seedLot({
      id: "lot-gone",
      productId: "product-gone",
      locationId: BRANCH,
      purchaseLineId: "line-9",
    });
    store.seedMovement({
      productId: "product-gone",
      locationId: BRANCH,
      kind: "receipt",
      reason: null,
      purchaseLineId: "line-9",
      delta: 1_000,
      occurredAt: RECEIVED_AT,
      actorId: "person-1",
      supersededByCountId: null,
    });
    const before = store.snapshot();

    expect(await withdraw(store, { purchaseLineId: "line-9" })).toEqual({ kind: "not_found" });
    expect(store.snapshot()).toEqual(before);
  });

  it("answers not found when no movement received the line", async () => {
    const store = await storeWithReceivedLine();
    store.seedLot({ id: "lot-9", ...YERBA, purchaseLineId: "line-9", remaining: 1_000 });
    const before = store.snapshot();

    expect(await withdraw(store, { purchaseLineId: "line-9" })).toEqual({ kind: "not_found" });
    expect(store.snapshot()).toEqual(before);
  });

  it("leaves nothing changed when a write fails half way", async () => {
    const store = await storeWithReceivedAndSplitLine();
    store.failingWrites.add("withdrawPurchasedLots");
    const before = store.snapshot();

    await expect(withdraw(store)).rejects.toThrow("withdrawPurchasedLots failed");
    expect(store.snapshot()).toEqual(before);
  });
});
