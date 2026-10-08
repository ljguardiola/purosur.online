import { describe, expect, it } from "vitest";
import { listPendingRefunds } from "./list-pending-refunds.js";
import { type FakePendingRefund, FakeRefundStore } from "./test-support/fake-refund-store.js";

const TRANSFER_REFUND: FakePendingRefund = {
  id: "refund-1",
  saleId: "sale-1",
  registerId: "register-1",
  registerName: "Caja 1",
  method: "TRANSFER",
  amount: 2000,
  occurredAt: new Date("2026-10-07T15:30:00.000Z"),
  cancelledBy: "cashier",
  cancelledByName: "Lucia",
  locationId: "branch-1",
};

describe("listPendingRefunds", () => {
  it("lists the pending refunds of the branch", async () => {
    const elsewhere = { ...TRANSFER_REFUND, id: "refund-2", locationId: "branch-2" };
    const store = new FakeRefundStore([], [TRANSFER_REFUND, elsewhere]);

    const refunds = await listPendingRefunds({ reader: store }, { locationId: "branch-1" });

    const { locationId: _branch, ...listed } = TRANSFER_REFUND;
    expect(refunds).toEqual([listed]);
    expect(store.pendingReads).toEqual(["branch-1"]);
  });

  it("lists nothing when the branch has no pending refund", async () => {
    const store = new FakeRefundStore();

    expect(await listPendingRefunds({ reader: store }, { locationId: "branch-1" })).toEqual([]);
  });
});
