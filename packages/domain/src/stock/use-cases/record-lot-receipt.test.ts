import { describe, expect, it } from "vitest";
import { recordLotReceipt } from "./record-lot-receipt.js";
import type { NewStockMovement } from "./stock-store.js";
import { FakeStockStore } from "./test-support/fake-stock-store.js";

const HONEY = { productId: "product-honey", locationId: "branch-1" };

const RECEIPT: NewStockMovement = {
  ...HONEY,
  purchaseLineId: "line-1",
  kind: "receipt",
  reason: null,
  delta: 10_000,
  occurredAt: new Date("2026-05-04T13:00:00.000Z"),
  actorId: "person-1",
  supersededByCountId: null,
};

const LOT = {
  ...HONEY,
  purchaseLineId: "line-1",
  quantityReceived: 10_000,
  costTotalCents: 5_000,
  costQuantity: 10_000,
  lotNumber: null,
  expiresOn: null,
  purchasedOn: "2026-05-04",
};

function receive(store: FakeStockStore, movement: NewStockMovement = RECEIPT) {
  return store.transaction((tx) => recordLotReceipt(tx, movement, () => tx.recordLot(LOT)));
}

describe("recordLotReceipt", () => {
  it("records the movement and the new lot, and keeps what was received in that lot", async () => {
    const store = new FakeStockStore();

    const { movementId, lotId } = await receive(store);

    const snapshot = store.snapshot();
    expect(snapshot.movements.map((movement) => movement.id)).toEqual([movementId]);
    expect(snapshot.lots.find((lot) => lot.id === lotId)?.remaining).toBe(10_000);
    expect(snapshot.allocations).toEqual([{ movementId, lotId, quantity: 10_000 }]);
    expect(store.balanceOf(HONEY)).toBe(10_000);
  });

  it("covers the debt of the product's lots before keeping the rest in the new lot", async () => {
    const store = new FakeStockStore();
    store.seedLot({ id: "honey-debt", ...HONEY, remaining: -3_000 });

    const { lotId } = await receive(store);

    const lots = store.snapshot().lots;
    expect(lots.find((lot) => lot.id === "honey-debt")?.remaining).toBe(0);
    expect(lots.find((lot) => lot.id === lotId)?.remaining).toBe(7_000);
  });

  it("records the lot but moves no stock into it when a later count already covers the movement", async () => {
    const store = new FakeStockStore();

    const { lotId } = await receive(store, { ...RECEIPT, supersededByCountId: "count-1" });

    const snapshot = store.snapshot();
    expect(snapshot.lots.find((lot) => lot.id === lotId)?.remaining).toBe(0);
    expect(snapshot.allocations).toEqual([]);
    expect(store.balanceOf(HONEY)).toBe(0);
  });

  it("reads the product's lots before recording the new one", async () => {
    const store = new FakeStockStore();

    await receive(store);

    const order = store.operationOrder;
    expect(order.indexOf("productLots")).toBeLessThan(order.indexOf("recordLot"));
    expect(order.indexOf("recordMovement")).toBeLessThan(order.indexOf("productLots"));
  });
});
