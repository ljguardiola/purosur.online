import { describe, expect, it } from "vitest";
import { cancelPurchaseOrder } from "./cancel-purchase-order.js";
import {
  type FakePurchaseOrderRow,
  FakePurchaseOrderStore,
} from "./test-support/fake-purchase-order-store.js";

const NOW = new Date("2026-03-10T15:00:00Z");
const CLOCK = { now: () => NOW };
const BRANCH = "branch-1";

function order(overrides: Partial<FakePurchaseOrderRow> = {}): FakePurchaseOrderRow {
  return {
    id: "order-9",
    supplierId: "supplier-a",
    locationId: BRANCH,
    state: "DRAFT",
    createdAt: new Date("2026-03-01T10:00:00Z"),
    actorId: "person-1",
    cancelledAt: null,
    sentAt: null,
    sentBy: null,
    lines: [],
    ...overrides,
  };
}

function storeWith(row: FakePurchaseOrderRow): FakePurchaseOrderStore {
  const store = new FakePurchaseOrderStore();
  store.seedOrder(row);
  return store;
}

const input = { locationId: BRANCH, orderId: "order-9", actorId: "person-2" };

describe("cancelPurchaseOrder", () => {
  it("moves a draft to cancelled and records when", async () => {
    const store = storeWith(order());

    expect(await cancelPurchaseOrder({ store, clock: CLOCK }, input)).toEqual({
      kind: "cancelled",
    });
    expect(store.orders()[0]).toMatchObject({ state: "CANCELLED", cancelledAt: NOW });
    expect(store.lockLog).toEqual(["order:order-9"]);
  });

  it("does not find an order of another branch or one that does not exist", async () => {
    const store = storeWith(order());

    expect(
      await cancelPurchaseOrder({ store, clock: CLOCK }, { ...input, locationId: "branch-2" }),
    ).toEqual({ kind: "not_found" });
    expect(
      await cancelPurchaseOrder({ store, clock: CLOCK }, { ...input, orderId: "order-none" }),
    ).toEqual({ kind: "not_found" });
    expect(store.orders()[0]?.state).toBe("DRAFT");
  });

  it("moves a sent order to cancelled and keeps when it was sent", async () => {
    const sentAt = new Date("2026-03-05T09:00:00Z");
    const store = storeWith(order({ state: "SENT", sentAt, sentBy: "person-1" }));

    expect(await cancelPurchaseOrder({ store, clock: CLOCK }, input)).toEqual({
      kind: "cancelled",
    });
    expect(store.orders()[0]).toMatchObject({
      state: "CANCELLED",
      cancelledAt: NOW,
      sentAt,
      sentBy: "person-1",
    });
  });

  it("cancels an order received in part", async () => {
    const store = storeWith(order({ state: "PARTIALLY_RECEIVED", receivedAt: null }));

    expect(await cancelPurchaseOrder({ store, clock: CLOCK }, input)).toEqual({
      kind: "cancelled",
    });
    expect(store.orders()[0]).toMatchObject({
      state: "CANCELLED",
      cancelledAt: NOW,
      receivedAt: null,
    });
  });

  it("refuses to cancel an order already received", async () => {
    const store = storeWith(order({ state: "RECEIVED" }));

    expect(await cancelPurchaseOrder({ store, clock: CLOCK }, input)).toEqual({
      kind: "not_cancellable",
    });
    expect(store.orders()[0]?.state).toBe("RECEIVED");
  });

  it("refuses to cancel an order already cancelled", async () => {
    const store = storeWith(order({ state: "CANCELLED", cancelledAt: NOW }));

    expect(await cancelPurchaseOrder({ store, clock: CLOCK }, input)).toEqual({
      kind: "not_cancellable",
    });
  });
});
