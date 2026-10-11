import { describe, expect, it } from "vitest";
import { discardRefund } from "./discard-refund.js";
import {
  FakeRefundStore,
  type FakeStoredRefund,
  FixedClock,
} from "./test-support/fake-refund-store.js";

const NOW = new Date("2026-10-08T14:00:00.000Z");
const LATE_PAYMENT: FakeStoredRefund = {
  id: "refund-1",
  locationId: "branch-1",
  state: "PENDING",
  origin: "late_payment",
};

function discard(store: FakeRefundStore, input: { refundId?: string; locationId?: string } = {}) {
  return discardRefund(
    { store, clock: new FixedClock(NOW) },
    { refundId: "refund-1", locationId: "branch-1", actorId: "manager", ...input },
  );
}

describe("discardRefund", () => {
  it("discards a late-payment refund, recording who did it and when, and resolves its alert in the same transaction", async () => {
    const store = new FakeRefundStore([{ ...LATE_PAYMENT }]);

    const outcome = await discard(store);

    expect(outcome).toEqual({ kind: "discarded", refundId: "refund-1", discardedAt: NOW });
    expect(store.refunds).toEqual([
      { ...LATE_PAYMENT, state: "DISCARDED", discardedBy: "manager", discardedAt: NOW },
    ]);
    expect(store.resolvedAlerts).toEqual([
      { refundId: "refund-1", resolvedBy: "manager", resolvedAt: NOW },
    ]);
    expect(store.transactions).toBe(1);
  });

  it("locks the refund before anything else", async () => {
    const store = new FakeRefundStore([{ ...LATE_PAYMENT }]);

    await discard(store);

    expect(store.operationOrder).toEqual([
      "lockRefund",
      "recordRefundDiscarded",
      "resolveLatePaymentRefundAlert",
    ]);
  });

  it("refuses to discard the refund of a cancelled sale, writing nothing", async () => {
    const cancelled: FakeStoredRefund = { ...LATE_PAYMENT, origin: "sale_cancelled" };
    const store = new FakeRefundStore([{ ...cancelled }]);

    expect(await discard(store)).toEqual({ kind: "not_discardable" });
    expect(store.refunds).toEqual([cancelled]);
    expect(store.resolvedAlerts).toEqual([]);
    expect(store.operationOrder).toEqual(["lockRefund"]);
  });

  it("answers not found for a refund that does not exist or belongs to another branch", async () => {
    const store = new FakeRefundStore([{ ...LATE_PAYMENT }]);

    expect(await discard(store, { refundId: "refund-9" })).toEqual({ kind: "not_found" });
    expect(await discard(store, { locationId: "branch-2" })).toEqual({ kind: "not_found" });
    expect(store.refunds).toEqual([LATE_PAYMENT]);
    expect(store.operationOrder).toEqual(["lockRefund", "lockRefund"]);
  });

  it("answers that a refund already done is, leaving it as it was", async () => {
    const done: FakeStoredRefund = {
      ...LATE_PAYMENT,
      state: "APPROVED",
      doneBy: "other",
      doneAt: new Date("2026-10-08T10:00:00.000Z"),
    };
    const store = new FakeRefundStore([{ ...done }]);

    expect(await discard(store)).toEqual({ kind: "already_done" });
    expect(store.refunds).toEqual([done]);
    expect(store.operationOrder).toEqual(["lockRefund"]);
  });

  it("answers that a refund already discarded is, leaving it as it was", async () => {
    const discarded: FakeStoredRefund = {
      ...LATE_PAYMENT,
      state: "DISCARDED",
      discardedBy: "other",
      discardedAt: new Date("2026-10-08T10:00:00.000Z"),
    };
    const store = new FakeRefundStore([{ ...discarded }]);

    expect(await discard(store)).toEqual({ kind: "already_discarded" });
    expect(store.refunds).toEqual([discarded]);
    expect(store.operationOrder).toEqual(["lockRefund"]);
  });

  it.each([
    "recordRefundDiscarded",
    "resolveLatePaymentRefundAlert",
  ] as const)("leaves the refund pending, with its alert open, if %s fails", async (step) => {
    const store = new FakeRefundStore([{ ...LATE_PAYMENT }]);
    store.failOn = step;

    await expect(discard(store)).rejects.toThrow(step);

    expect(store.refunds).toEqual([LATE_PAYMENT]);
    expect(store.resolvedAlerts).toEqual([]);
  });
});
