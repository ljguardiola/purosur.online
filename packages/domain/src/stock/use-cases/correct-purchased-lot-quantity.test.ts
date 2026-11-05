import { describe, expect, it } from "vitest";
import { correctPurchasedLotQuantity } from "./correct-purchased-lot-quantity.js";
import { receivePurchasedStock } from "./receive-purchased-stock.js";
import { registerCount } from "./register-count.js";
import { FakeStockStore, FixedClock } from "./test-support/fake-stock-store.js";

const RECEIVED_AT = new Date("2026-03-10T15:00:00.000Z");
const BRANCH = "branch-1";
const YERBA = { productId: "product-yerba", locationId: BRANCH };

function storeWithReceivedLine(): FakeStockStore {
  const store = new FakeStockStore();
  store.seedProduct({ id: "product-yerba", saleUnit: "UNIT" });
  store.seedProduct({ id: "product-harina", saleUnit: "KG" });
  store.seedBalance({ ...YERBA, quantity: 5_000 });
  return store;
}

async function receive(store: FakeStockStore, productId = "product-yerba") {
  await store.transaction((tx) =>
    receivePurchasedStock(tx, {
      locationId: BRANCH,
      occurredAt: RECEIVED_AT,
      purchasedOn: "2026-03-09",
      actorId: "person-1",
      lines: [
        {
          purchaseLineId: "line-1",
          productId,
          quantity: 24_000,
          costPaidCents: 1_450_050,
          quantityPerPackage: 12_000,
          expiresOn: "2027-01-31",
        },
      ],
    }),
  );
}

function input(overrides = {}) {
  return {
    locationId: BRANCH,
    purchaseLineId: "line-1",
    delta: -4_000,
    actorId: "person-2",
    ...overrides,
  };
}

function correct(store: FakeStockStore, overrides = {}) {
  return store.transaction((tx) => correctPurchasedLotQuantity(tx, input(overrides)));
}

async function leave(store: FakeStockStore, quantity: number) {
  await store.transaction((tx) =>
    tx.allocateToLot({ movementId: "sale-1", lotId: "lot-1", quantity: -quantity }),
  );
}

function lotOf(store: FakeStockStore, lotId = "lot-1") {
  const lot = store.snapshot().lots.find((row) => row.id === lotId);
  if (!lot) {
    throw new Error(`lot ${lotId} does not exist`);
  }
  return lot;
}

describe("correctPurchasedLotQuantity", () => {
  it("takes fewer units from the balance and from the line's lot, keeping the lot's cost", async () => {
    const store = storeWithReceivedLine();
    await receive(store);
    const costBefore = lotOf(store).costTotalCents;

    const outcome = await correct(store, { delta: -4_000 });

    expect(outcome).toEqual({ kind: "corrected" });
    expect(store.balanceOf(YERBA)).toBe(25_000);
    expect(lotOf(store)).toMatchObject({
      remaining: 20_000,
      quantityReceived: 20_000,
      costTotalCents: costBefore,
    });
  });

  it("adds units to the balance and to the line's lot at the lot's cost", async () => {
    const store = storeWithReceivedLine();
    await receive(store);
    const before = lotOf(store);

    const outcome = await correct(store, { delta: 6_000 });

    expect(outcome).toEqual({ kind: "corrected" });
    expect(store.balanceOf(YERBA)).toBe(35_000);
    expect(lotOf(store)).toMatchObject({
      remaining: 30_000,
      quantityReceived: 30_000,
      costTotalCents: before.costTotalCents,
      costQuantity: before.costQuantity,
      expiresOn: before.expiresOn,
    });
  });

  it("records a receipt of the difference, dated when the line was received and carrying the line", async () => {
    const store = storeWithReceivedLine();
    await receive(store);

    await correct(store, { delta: -4_000 });

    expect(store.snapshot().movements.at(-1)).toEqual({
      id: "movement-2",
      ...YERBA,
      kind: "receipt",
      reason: null,
      purchaseLineId: "line-1",
      delta: -4_000,
      occurredAt: RECEIVED_AT,
      actorId: "person-2",
      supersededByCountId: null,
    });
    expect(store.snapshot().allocations.at(-1)).toEqual({
      movementId: "movement-2",
      lotId: "lot-1",
      quantity: -4_000,
    });
  });

  it("lets all the units still in the lot go, but not one more", async () => {
    const store = storeWithReceivedLine();
    await receive(store);
    await leave(store, 20_000);
    const before = store.snapshot();

    const notEnough = await correct(store, { delta: -5_000 });
    expect(notEnough).toEqual({ kind: "not_enough_in_lot" });
    expect(store.snapshot()).toEqual(before);
    const exact = await correct(store, { delta: -4_000 });
    expect(exact).toEqual({ kind: "corrected" });
    expect(lotOf(store).remaining).toBe(0);
  });

  it("bounds the units that go by the line's own lot and never takes them from a lot split from it", async () => {
    const store = storeWithReceivedLine();
    await receive(store);
    store.seedLot({
      id: "lot-split",
      ...YERBA,
      purchaseLineId: "line-1",
      splitFromLotId: "lot-1",
      remaining: 3_000,
      quantityReceived: 3_000,
    });
    await leave(store, 21_000);

    const refused = await correct(store, { delta: -4_000 });
    const allowed = await correct(store, { delta: -3_000 });

    expect(refused).toEqual({ kind: "not_enough_in_lot" });
    expect(allowed).toEqual({ kind: "corrected" });
    expect(lotOf(store).remaining).toBe(0);
    expect(lotOf(store, "lot-split")).toMatchObject({ remaining: 3_000, quantityReceived: 3_000 });
  });

  it("takes the units from the line's own lot even when a lot split from it is listed before it", async () => {
    const store = storeWithReceivedLine();
    store.seedLot({
      id: "lot-split",
      ...YERBA,
      purchaseLineId: "line-1",
      splitFromLotId: "lot-own",
      remaining: 3_000,
    });
    store.seedLot({
      id: "lot-own",
      ...YERBA,
      purchaseLineId: "line-1",
      remaining: 24_000,
      quantityReceived: 24_000,
    });
    store.seedMovement({
      ...YERBA,
      kind: "receipt",
      reason: null,
      purchaseLineId: "line-1",
      delta: 24_000,
      occurredAt: RECEIVED_AT,
      actorId: "person-1",
      supersededByCountId: null,
    });

    await correct(store, { delta: -4_000 });

    expect(lotOf(store, "lot-own")).toMatchObject({ remaining: 20_000, quantityReceived: 20_000 });
    expect(lotOf(store, "lot-split")).toMatchObject({ remaining: 3_000, quantityReceived: 0 });
  });

  it("adds units to a lot that has been given more than it had", async () => {
    const store = storeWithReceivedLine();
    await receive(store);
    await leave(store, 27_000);

    const outcome = await correct(store, { delta: 1_000 });

    expect(outcome).toEqual({ kind: "corrected" });
    expect(lotOf(store).remaining).toBe(-2_000);
  });

  it("refuses a difference that is not a quantity the product is sold in, changing nothing", async () => {
    const store = storeWithReceivedLine();
    await receive(store);
    const before = store.snapshot();

    expect(await correct(store, { delta: -500 })).toEqual({ kind: "invalid_quantity" });
    expect(await correct(store, { delta: 0 })).toEqual({ kind: "invalid_quantity" });
    expect(store.snapshot()).toEqual(before);
  });

  it("accepts a difference in thousandths of a product sold by weight", async () => {
    const store = storeWithReceivedLine();
    store.seedBalance({ productId: "product-harina", locationId: BRANCH, quantity: 0 });
    await receive(store, "product-harina");

    const outcome = await correct(store, { delta: -500 });

    expect(outcome).toEqual({ kind: "corrected" });
    expect(lotOf(store).remaining).toBe(23_500);
  });

  it("answers not found when the line created no lot in the branch", async () => {
    const store = storeWithReceivedLine();
    await receive(store);
    const before = store.snapshot();

    expect(await correct(store, { purchaseLineId: "line-other" })).toEqual({ kind: "not_found" });
    expect(await correct(store, { locationId: "branch-2" })).toEqual({ kind: "not_found" });
    expect(store.snapshot()).toEqual(before);
  });

  it("answers not found when the lot's product is gone, changing nothing", async () => {
    const store = storeWithReceivedLine();
    store.seedLot({
      id: "lot-1",
      productId: "product-gone",
      locationId: BRANCH,
      purchaseLineId: "line-1",
    });
    const before = store.snapshot();

    expect(await correct(store)).toEqual({ kind: "not_found" });
    expect(store.snapshot()).toEqual(before);
  });

  it("answers not found when a lot split from the line is all there is of it", async () => {
    const store = storeWithReceivedLine();
    store.seedLot({
      id: "lot-split",
      ...YERBA,
      purchaseLineId: "line-1",
      splitFromLotId: "lot-1",
    });

    expect(await correct(store)).toEqual({ kind: "not_found" });
  });

  it("answers not found when no movement received the line, changing nothing", async () => {
    const store = storeWithReceivedLine();
    store.seedLot({ id: "lot-1", ...YERBA, purchaseLineId: "line-1", remaining: 24_000 });
    const before = store.snapshot();

    expect(await correct(store)).toEqual({ kind: "not_found" });
    expect(store.snapshot()).toEqual(before);
  });

  it("answers not found when the lot has no purchase day to be read by", async () => {
    const store = storeWithReceivedLine();
    await receive(store);
    store.seedLot({ id: "lot-9", ...YERBA, purchaseLineId: "line-9", purchasedOn: null });
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
    const before = store.snapshot();

    expect(await correct(store, { purchaseLineId: "line-9", delta: -1_000 })).toEqual({
      kind: "not_found",
    });
    expect(store.snapshot()).toEqual(before);
  });

  it("locks the product's stock before it reads the lot's units or changes anything", async () => {
    const store = storeWithReceivedLine();
    await receive(store);
    store.operationOrder.length = 0;

    await correct(store);

    expect(store.operationOrder).toEqual([
      "lotsOfPurchaseLines",
      "lockProductStock",
      "receiptInstantOfPurchaseLine",
      "earliestCountAtOrAfter",
      "splittableLot",
      "recordMovement",
      "addToBalance",
      "allocateToLot",
      "addToLotQuantityReceived",
    ]);
  });

  describe("when a count of the product was taken after the line was received", () => {
    function seedCountAfterReceipt(store: FakeStockStore): string {
      return store.seedMovement({
        ...YERBA,
        kind: "count",
        reason: null,
        delta: 0,
        occurredAt: new Date("2026-03-11T10:00:00.000Z"),
        actorId: "person-3",
        supersededByCountId: null,
      });
    }

    it("records the correction as covered by that count, leaving the balance and the lot's units alone", async () => {
      const store = storeWithReceivedLine();
      await receive(store);
      const countId = seedCountAfterReceipt(store);
      const allocationsBefore = store.snapshot().allocations;

      const outcome = await correct(store, { delta: -4_000 });

      expect(outcome).toEqual({ kind: "corrected" });
      expect(store.balanceOf(YERBA)).toBe(29_000);
      expect(lotOf(store).remaining).toBe(24_000);
      expect(store.snapshot().allocations).toEqual(allocationsBefore);
      expect(store.snapshot().movements.at(-1)).toMatchObject({
        kind: "receipt",
        delta: -4_000,
        occurredAt: RECEIVED_AT,
        purchaseLineId: "line-1",
        supersededByCountId: countId,
      });
    });

    it("still records the units the line's lot was received with", async () => {
      const store = storeWithReceivedLine();
      await receive(store);
      seedCountAfterReceipt(store);

      await correct(store, { delta: 2_000 });

      expect(lotOf(store).quantityReceived).toBe(26_000);
    });

    it("lets the quantity go down by more than the lot has left, as the count already saw what arrived", async () => {
      const store = storeWithReceivedLine();
      await receive(store);
      seedCountAfterReceipt(store);
      await leave(store, 24_000);

      const outcome = await correct(store, { delta: -10_000 });

      expect(outcome).toEqual({ kind: "corrected" });
      expect(lotOf(store).remaining).toBe(0);
    });

    it("answers the covering count even when it was taken at the very moment of the receipt", async () => {
      const store = storeWithReceivedLine();
      await receive(store);
      const countId = store.seedMovement({
        ...YERBA,
        kind: "count",
        reason: null,
        delta: 0,
        occurredAt: RECEIVED_AT,
        actorId: "person-3",
        supersededByCountId: null,
      });

      await correct(store, { delta: -4_000 });

      expect(store.snapshot().movements.at(-1)?.supersededByCountId).toBe(countId);
    });

    it("ignores a count taken before the line was received", async () => {
      const store = storeWithReceivedLine();
      store.seedMovement({
        ...YERBA,
        kind: "count",
        reason: null,
        delta: 0,
        occurredAt: new Date("2026-03-09T10:00:00.000Z"),
        actorId: "person-3",
        supersededByCountId: null,
      });
      await receive(store);

      await correct(store, { delta: -4_000 });

      expect(store.balanceOf(YERBA)).toBe(25_000);
      expect(store.snapshot().movements.at(-1)?.supersededByCountId).toBeNull();
    });
  });

  it("makes a later count dated between the receipt and now expect the corrected quantity", async () => {
    const store = storeWithReceivedLine();
    await receive(store);
    await correct(store, { delta: -4_000 });

    const outcome = await registerCount(
      { store, clock: new FixedClock(new Date("2026-03-12T10:00:00.000Z")) },
      {
        ...YERBA,
        counted: 25_000,
        occurredAt: new Date("2026-03-11T10:00:00.000Z"),
        actorId: "person-3",
      },
    );

    expect(outcome).toMatchObject({ kind: "recorded", expected: 25_000, delta: 0 });
  });
});
