import { describe, expect, it } from "vitest";
import { markRefundDone } from "./mark-refund-done.js";
import {
  FakeRefundStore,
  type FakeStoredRefund,
  FixedClock,
} from "./test-support/fake-refund-store.js";

const NOW = new Date("2026-10-08T14:00:00.000Z");
const PENDING: FakeStoredRefund = {
  id: "refund-1",
  locationId: "branch-1",
  state: "PENDING",
  origin: "sale_cancelled",
  method: "TRANSFER",
  confirmedAt: null,
};
const LATE_PAYMENT: FakeStoredRefund = { ...PENDING, origin: "late_payment", method: "POINT" };
const LATE_QR_PAYMENT: FakeStoredRefund = { ...LATE_PAYMENT, method: "QR" };
const QR_OF_CANCELLED_SALE: FakeStoredRefund = { ...PENDING, method: "QR" };
const POINT_OF_CANCELLED_SALE: FakeStoredRefund = { ...PENDING, method: "POINT" };

function mark(store: FakeRefundStore, input: { refundId?: string; locationId?: string } = {}) {
  return markRefundDone(
    { store, clock: new FixedClock(NOW) },
    { refundId: "refund-1", locationId: "branch-1", actorId: "manager", ...input },
  );
}

describe("markRefundDone", () => {
  it("marks a pending refund as done by whoever carried it out, at the moment they did", async () => {
    const store = new FakeRefundStore([{ ...PENDING }]);

    const outcome = await mark(store);

    expect(outcome).toEqual({ kind: "marked_done", refundId: "refund-1", doneAt: NOW });
    expect(store.refunds).toEqual([
      { ...PENDING, state: "APPROVED", doneBy: "manager", doneAt: NOW },
    ]);
  });

  it("locks the refund before writing and does it all in one transaction", async () => {
    const store = new FakeRefundStore([{ ...PENDING }]);

    await mark(store);

    expect(store.operationOrder.slice(0, 2)).toEqual(["lockRefund", "recordRefundDone"]);
    expect(store.transactions).toBe(1);
  });

  it("answers not found for a refund that does not exist", async () => {
    const store = new FakeRefundStore([{ ...PENDING }]);

    expect(await mark(store, { refundId: "refund-9" })).toEqual({ kind: "not_found" });
    expect(store.refunds).toEqual([PENDING]);
    expect(store.operationOrder).toEqual(["lockRefund"]);
  });

  it("answers not found for a refund of another branch", async () => {
    const store = new FakeRefundStore([{ ...PENDING }]);

    expect(await mark(store, { locationId: "branch-2" })).toEqual({ kind: "not_found" });
    expect(store.refunds).toEqual([PENDING]);
  });

  it("answers that a refund already done is, leaving it as it was", async () => {
    const done: FakeStoredRefund = {
      ...PENDING,
      state: "APPROVED",
      doneBy: "other",
      doneAt: new Date("2026-10-08T10:00:00.000Z"),
    };
    const store = new FakeRefundStore([{ ...done }]);

    expect(await mark(store)).toEqual({ kind: "already_done" });
    expect(store.refunds).toEqual([done]);
    expect(store.operationOrder).toEqual(["lockRefund"]);
  });

  it.each([
    ["unconfirmed", null],
    ["confirmed", new Date("2026-10-08T13:00:00.000Z")],
  ])(
    "refuses to mark a %s late QR payment refund done by hand, writing nothing",
    async (_case, confirmedAt) => {
      const refund: FakeStoredRefund = { ...LATE_QR_PAYMENT, confirmedAt };
      const store = new FakeRefundStore([{ ...refund }]);

      expect(await mark(store)).toEqual({ kind: "sent_by_cloud" });
      expect(store.refunds).toEqual([refund]);
      expect(store.resolvedAlerts).toEqual([]);
    },
  );

  it("resolves the alert of a late-payment refund, in the same transaction, when it is marked done", async () => {
    const store = new FakeRefundStore([{ ...LATE_PAYMENT }]);

    await mark(store);

    expect(store.operationOrder).toEqual(["lockRefund", "recordRefundDone", "resolveRefundAlert"]);
    expect(store.resolvedAlerts).toEqual([
      {
        refundId: "refund-1",
        kind: "late_payment_refund",
        resolvedBy: "manager",
        resolvedAt: NOW,
      },
    ]);
    expect(store.transactions).toBe(1);
  });

  it("resolves the refund task alert, in the same transaction, when a refund of a cancelled sale is marked done", async () => {
    const store = new FakeRefundStore([{ ...PENDING }]);

    await mark(store);

    expect(store.operationOrder).toEqual(["lockRefund", "recordRefundDone", "resolveRefundAlert"]);
    expect(store.resolvedAlerts).toEqual([
      { refundId: "refund-1", kind: "refund_task", resolvedBy: "manager", resolvedAt: NOW },
    ]);
    expect(store.transactions).toBe(1);
  });

  it("answers that a discarded refund was discarded, not that it was done, leaving it as it was", async () => {
    const discarded: FakeStoredRefund = {
      ...LATE_PAYMENT,
      state: "DISCARDED",
      discardedBy: "other",
      discardedAt: new Date("2026-10-08T10:00:00.000Z"),
    };
    const store = new FakeRefundStore([{ ...discarded }]);

    expect(await mark(store)).toEqual({ kind: "discarded" });
    expect(store.refunds).toEqual([discarded]);
    expect(store.resolvedAlerts).toEqual([]);
    expect(store.operationOrder).toEqual(["lockRefund"]);
  });

  it("leaves a late-payment refund pending, with its alert open, if resolving the alert fails", async () => {
    const store = new FakeRefundStore([{ ...LATE_PAYMENT }]);
    store.failOn = "resolveRefundAlert";

    await expect(mark(store)).rejects.toThrow("resolveRefundAlert failed");

    expect(store.refunds).toEqual([LATE_PAYMENT]);
    expect(store.resolvedAlerts).toEqual([]);
  });

  it("leaves a refund of a cancelled sale pending, with its alert open, if resolving the alert fails", async () => {
    const store = new FakeRefundStore([{ ...PENDING }]);
    store.failOn = "resolveRefundAlert";

    await expect(mark(store)).rejects.toThrow("resolveRefundAlert failed");

    expect(store.refunds).toEqual([PENDING]);
    expect(store.resolvedAlerts).toEqual([]);
  });

  it("leaves the refund pending if recording it fails", async () => {
    const store = new FakeRefundStore([{ ...PENDING }]);
    store.failOn = "recordRefundDone";

    await expect(mark(store)).rejects.toThrow("recordRefundDone failed");

    expect(store.refunds).toEqual([PENDING]);
  });

  it("refuses to mark done a refund of a cancelled sale paid by QR, which the cloud sends to Mercado Pago, leaving it as it was", async () => {
    const store = new FakeRefundStore([{ ...QR_OF_CANCELLED_SALE }]);

    expect(await mark(store)).toEqual({ kind: "sent_by_cloud" });
    expect(store.refunds).toEqual([QR_OF_CANCELLED_SALE]);
    expect(store.resolvedAlerts).toEqual([]);
    expect(store.operationOrder).toEqual(["lockRefund"]);
  });

  it("refuses to mark done a refund of a cancelled sale paid on the Point terminal, which the cloud sends to Mercado Pago, leaving it as it was", async () => {
    const store = new FakeRefundStore([{ ...POINT_OF_CANCELLED_SALE }]);

    expect(await mark(store)).toEqual({ kind: "sent_by_cloud" });
    expect(store.refunds).toEqual([POINT_OF_CANCELLED_SALE]);
    expect(store.resolvedAlerts).toEqual([]);
    expect(store.operationOrder).toEqual(["lockRefund"]);
  });

  it("still marks done the late-payment refund of a QR payment, which a person carries out", async () => {
    const store = new FakeRefundStore([{ ...LATE_PAYMENT }]);

    expect((await mark(store)).kind).toBe("marked_done");
  });
});
