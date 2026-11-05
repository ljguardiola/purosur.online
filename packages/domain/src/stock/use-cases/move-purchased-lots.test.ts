import { describe, expect, it } from "vitest";
import { movePurchasedLots } from "./move-purchased-lots.js";
import type { FakeStockStore } from "./test-support/fake-stock-store.js";
import {
  ACTOR,
  BRANCH,
  countOf,
  FIDEOS,
  leaveLotBy,
  RECEIVED_AT,
  storeWithReceivedAndSplitLine,
  storeWithReceivedLine,
  YERBA,
} from "./test-support/purchased-line-scenario.js";

function move(store: FakeStockStore, overrides = {}) {
  return store.transaction((tx) =>
    movePurchasedLots(tx, {
      locationId: BRANCH,
      purchaseLineId: "line-1",
      productId: FIDEOS.productId,
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

describe("movePurchasedLots", () => {
  it("takes the units out of the old product and puts them in the new one", async () => {
    const store = await storeWithReceivedAndSplitLine();

    const outcome = await move(store);

    expect(outcome).toEqual({ kind: "moved" });
    expect(store.balanceOf(YERBA)).toBe(5_000);
    expect(store.balanceOf(FIDEOS)).toBe(26_000);
  });

  it("records a receipt of the negative total for the old product and one of the total for the new, both dated when the line was received", async () => {
    const store = await storeWithReceivedAndSplitLine();

    await move(store);

    const movements = store.snapshot().movements;
    expect(movements.slice(2)).toEqual([
      {
        id: "movement-3",
        ...YERBA,
        kind: "receipt",
        reason: null,
        purchaseLineId: "line-1",
        delta: -24_000,
        occurredAt: RECEIVED_AT,
        actorId: ACTOR,
        supersededByCountId: null,
      },
      {
        id: "movement-4",
        ...FIDEOS,
        kind: "receipt",
        reason: null,
        purchaseLineId: "line-1",
        delta: 24_000,
        occurredAt: RECEIVED_AT,
        actorId: ACTOR,
        supersededByCountId: null,
      },
    ]);
  });

  it("empties and withdraws the old lots and gives the new product lots with the same units, cost and dates, the split one split from the new own lot", async () => {
    const store = await storeWithReceivedAndSplitLine();
    const own = lot(store, "lot-1");
    const split = lot(store, "lot-split");

    await move(store);

    expect(lot(store, "lot-1")).toMatchObject({ remaining: 0, withdrawn: true });
    expect(lot(store, "lot-split")).toMatchObject({ remaining: 0, withdrawn: true });
    expect(lot(store, "lot-3")).toEqual({
      id: "lot-3",
      ...FIDEOS,
      technical: false,
      purchaseLineId: "line-1",
      splitFromLotId: null,
      quantityReceived: 24_000,
      remaining: 21_000,
      costTotalCents: 1_450_050,
      costQuantity: 12_000,
      costComplete: true,
      expiresOn: "2027-01-31",
      purchasedOn: "2026-03-09",
      receivedAt: own.receivedAt,
      originMovementId: null,
      assemblyBatchId: null,
      withdrawn: false,
    });
    expect(lot(store, "lot-4")).toEqual({
      id: "lot-4",
      ...FIDEOS,
      technical: false,
      purchaseLineId: "line-1",
      splitFromLotId: "lot-3",
      quantityReceived: 3_000,
      remaining: 3_000,
      costTotalCents: 1_450_050,
      costQuantity: 12_000,
      costComplete: true,
      expiresOn: "2026-12-01",
      purchasedOn: "2026-03-09",
      receivedAt: split.receivedAt,
      originMovementId: null,
      assemblyBatchId: null,
      withdrawn: false,
    });
  });

  it("allocates the old units away from the old lots and the same units to the new lots", async () => {
    const store = await storeWithReceivedAndSplitLine();

    await move(store);

    expect(store.snapshot().allocations.slice(-4)).toEqual([
      { movementId: "movement-3", lotId: "lot-1", quantity: -21_000 },
      { movementId: "movement-3", lotId: "lot-split", quantity: -3_000 },
      { movementId: "movement-4", lotId: "lot-3", quantity: 21_000 },
      { movementId: "movement-4", lotId: "lot-4", quantity: 3_000 },
    ]);
  });

  it("makes the new lots the line's lots and the old ones no longer its lots", async () => {
    const store = await storeWithReceivedAndSplitLine();
    await move(store);

    const lots = await store.transaction((tx) => tx.lotsOfPurchaseLines(BRANCH, ["line-1"]));

    expect(lots.map(({ lotId, productId }) => [lotId, productId])).toEqual([
      ["lot-3", FIDEOS.productId],
      ["lot-4", FIDEOS.productId],
    ]);
  });

  it("recreates a lot with a cost that is incomplete or unknown the way it was", async () => {
    const store = await storeWithReceivedLine();
    store.seedLot({
      id: "lot-unknown",
      ...YERBA,
      purchaseLineId: "line-1",
      splitFromLotId: "lot-1",
      quantityReceived: 1_000,
      remaining: 1_000,
      costTotalCents: null,
      costQuantity: null,
      costComplete: false,
    });

    await move(store);

    expect(lot(store, "lot-4")).toMatchObject({
      costTotalCents: null,
      costQuantity: null,
      costComplete: false,
    });
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

    await move(store);

    expect(store.snapshot().allocations.map(({ lotId }) => lotId)).toEqual([
      "lot-1",
      "lot-1",
      "lot-3",
    ]);
    expect(lot(store, "lot-4")).toMatchObject({ splitFromLotId: "lot-3", remaining: 0 });
  });

  it("locks both products' stock in the order of their ids, not old before new", async () => {
    const store = await storeWithReceivedLine();
    store.lockedProducts.length = 0;
    store.operationOrder.length = 0;

    await move(store);

    expect(store.lockedProducts).toEqual([FIDEOS.productId, YERBA.productId]);
    expect(store.operationOrder.slice(0, 4)).toEqual([
      "lotsOfPurchaseLines",
      "lockProductStock",
      "lockProductStock",
      "receiptInstantOfPurchaseLine",
    ]);
  });

  it("locks them in the order of their ids when the new product's id comes last", async () => {
    const store = await storeWithReceivedLine();
    await move(store);
    store.lockedProducts.length = 0;

    await move(store, { productId: YERBA.productId });

    expect(store.lockedProducts).toEqual([FIDEOS.productId, YERBA.productId]);
  });

  it("reads every count before it writes anything", async () => {
    const store = await storeWithReceivedLine();
    store.operationOrder.length = 0;

    await move(store);

    expect(store.operationOrder).toEqual([
      "lotsOfPurchaseLines",
      "lockProductStock",
      "lockProductStock",
      "receiptInstantOfPurchaseLine",
      "earliestCountAtOrAfter",
      "earliestCountAtOrAfter",
      "movementsAllocatedToLots",
      "purchasedLotFacts",
      "recordMovement",
      "addToBalance",
      "allocateToLot",
      "withdrawPurchasedLots",
      "recordMovement",
      "addToBalance",
      "recordMovedLot",
      "allocateToLot",
    ]);
  });

  it("moves the lots to the same product as a withdrawal and a new receipt, locking it once", async () => {
    const store = await storeWithReceivedLine();
    store.lockedProducts.length = 0;

    const outcome = await move(store, { productId: YERBA.productId });

    expect(outcome).toEqual({ kind: "moved" });
    expect(store.lockedProducts).toEqual([YERBA.productId]);
    expect(store.balanceOf(YERBA)).toBe(29_000);
    expect(lot(store, "lot-2")).toMatchObject({ remaining: 24_000, withdrawn: false });
  });

  it.each([
    ["old", YERBA],
    ["new", FIDEOS],
  ])(
    "refuses when a count of the %s product was taken after the line was received, changing nothing",
    async (_which, key) => {
      const store = await storeWithReceivedAndSplitLine();
      countOf(store, key, new Date("2026-03-20T10:00:00.000Z"));
      const before = store.snapshot();

      expect(await move(store)).toEqual({ kind: "counted_since_receipt" });
      expect(store.snapshot()).toEqual(before);
    },
  );

  it("refuses a count of the new product taken at the very instant the line was received", async () => {
    const store = await storeWithReceivedLine();
    countOf(store, FIDEOS, RECEIVED_AT);

    expect(await move(store)).toEqual({ kind: "counted_since_receipt" });
  });

  it("is not stopped by a count of either product taken before the line was received", async () => {
    const store = await storeWithReceivedLine();
    countOf(store, YERBA, new Date("2026-03-01T10:00:00.000Z"));
    countOf(store, FIDEOS, new Date("2026-03-01T10:00:00.000Z"));

    expect(await move(store)).toEqual({ kind: "moved" });
  });

  it("refuses when units left a lot of the line, changing nothing", async () => {
    const store = await storeWithReceivedAndSplitLine();
    await leaveLotBy(store, "sale", -1_000, "lot-split");
    const before = store.snapshot();

    expect(await move(store)).toEqual({ kind: "units_left_lot" });
    expect(store.snapshot()).toEqual(before);
  });

  it("answers the count before units that left the lot", async () => {
    const store = await storeWithReceivedLine();
    await leaveLotBy(store, "sale", -1_000);
    countOf(store, FIDEOS, new Date("2026-03-20T10:00:00.000Z"));

    expect(await move(store)).toEqual({ kind: "counted_since_receipt" });
  });

  it("answers not found when the line created no lot, or the new product does not exist, changing nothing", async () => {
    const store = await storeWithReceivedLine();
    const before = store.snapshot();

    expect(await move(store, { purchaseLineId: "line-other" })).toEqual({ kind: "not_found" });
    expect(await move(store, { locationId: "branch-2" })).toEqual({ kind: "not_found" });
    expect(await move(store, { productId: "product-gone" })).toEqual({ kind: "not_found" });
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

    expect(await move(store, { purchaseLineId: "line-9" })).toEqual({ kind: "not_found" });
  });

  it("answers not found when the old product is gone or no movement received the line", async () => {
    const store = await storeWithReceivedLine();
    store.seedLot({
      id: "lot-gone",
      productId: "product-gone",
      locationId: BRANCH,
      purchaseLineId: "line-8",
    });
    store.seedLot({ id: "lot-9", ...YERBA, purchaseLineId: "line-9", remaining: 1_000 });
    const before = store.snapshot();

    expect(await move(store, { purchaseLineId: "line-8" })).toEqual({ kind: "not_found" });
    expect(await move(store, { purchaseLineId: "line-9" })).toEqual({ kind: "not_found" });
    expect(store.snapshot()).toEqual(before);
  });

  it("leaves nothing changed when a write fails half way", async () => {
    const store = await storeWithReceivedAndSplitLine();
    store.failingWrites.add("recordMovedLot");
    const before = store.snapshot();

    await expect(move(store)).rejects.toThrow("recordMovedLot failed");
    expect(store.snapshot()).toEqual(before);
  });
});
