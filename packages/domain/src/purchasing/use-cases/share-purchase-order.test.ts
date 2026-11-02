import { describe, expect, it } from "vitest";
import { sharePurchaseOrder } from "./share-purchase-order.js";
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

describe("sharePurchaseOrder", () => {
  it("moves a draft to sent and records when and by whom", async () => {
    const store = storeWith(order());

    expect(await sharePurchaseOrder({ store, clock: CLOCK }, input)).toEqual({ kind: "shared" });
    expect(store.orders()[0]).toMatchObject({ state: "SENT", sentAt: NOW, sentBy: "person-2" });
    expect(store.lockLog).toEqual(["order:order-9"]);
  });

  it("does not find an order of another branch or one that does not exist", async () => {
    const store = storeWith(order());

    expect(
      await sharePurchaseOrder({ store, clock: CLOCK }, { ...input, locationId: "branch-2" }),
    ).toEqual({ kind: "not_found" });
    expect(
      await sharePurchaseOrder({ store, clock: CLOCK }, { ...input, orderId: "order-none" }),
    ).toEqual({ kind: "not_found" });
    expect(store.orders()[0]?.state).toBe("DRAFT");
  });

  it("refuses to share an order already sent and leaves it as it was", async () => {
    const sentAt = new Date("2026-03-05T09:00:00Z");
    const store = storeWith(order({ state: "SENT", sentAt, sentBy: "person-1" }));

    expect(await sharePurchaseOrder({ store, clock: CLOCK }, input)).toEqual({
      kind: "not_shareable",
    });
    expect(store.orders()[0]).toMatchObject({ state: "SENT", sentAt, sentBy: "person-1" });
  });

  it("refuses to share a cancelled order", async () => {
    const store = storeWith(order({ state: "CANCELLED", cancelledAt: NOW }));

    expect(await sharePurchaseOrder({ store, clock: CLOCK }, input)).toEqual({
      kind: "not_shareable",
    });
    expect(store.orders()[0]?.state).toBe("CANCELLED");
  });

  it("leaves the order a draft when recording the sending fails", async () => {
    const store = storeWith(order());
    store.failWriteAtCall("markPurchaseOrderSent", 1);

    await expect(sharePurchaseOrder({ store, clock: CLOCK }, input)).rejects.toThrow();
    expect(store.orders()[0]).toMatchObject({ state: "DRAFT", sentAt: null });
  });
});
