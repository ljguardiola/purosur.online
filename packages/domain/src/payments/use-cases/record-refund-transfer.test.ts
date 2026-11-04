import { describe, expect, it } from "vitest";
import { recordRefundTransfer } from "./record-refund-transfer.js";
import {
  FakeRefundStore,
  type FakeStoredRefund,
  FixedClock,
} from "./test-support/fake-refund-store.js";

const NOW = new Date("2026-10-08T14:00:00.000Z");
const CONFIRMED_AT = new Date("2026-10-08T13:00:00.000Z");
const TRANSFER = { kind: "bank", operationNumber: "00123456" } as const;
const REFUSED_FOR_GOOD: FakeStoredRefund = {
  id: "refund-1",
  locationId: "branch-1",
  state: "PENDING",
  origin: "sale_cancelled",
  method: "QR",
  confirmedAt: CONFIRMED_AT,
  lastRefusalReason: "cannot_refund_order",
};

function record(
  store: FakeRefundStore,
  input: { refundId?: string; locationId?: string; kind?: "bank" | "mercado_pago" } = {},
) {
  const { kind, ...rest } = input;
  return recordRefundTransfer(
    { store, clock: new FixedClock(NOW) },
    {
      refundId: "refund-1",
      locationId: "branch-1",
      actorId: "manager",
      transfer: { ...TRANSFER, kind: kind ?? TRANSFER.kind },
      ...rest,
    },
  );
}

describe("recordRefundTransfer", () => {
  it("records a refund Mercado Pago refused for good as done with its transfer, who recorded it and when", async () => {
    const store = new FakeRefundStore([{ ...REFUSED_FOR_GOOD }]);

    const outcome = await record(store, { kind: "mercado_pago" });

    expect(outcome).toEqual({ kind: "refunded_by_transfer", refundId: "refund-1", doneAt: NOW });
    expect(store.refunds).toEqual([
      {
        ...REFUSED_FOR_GOOD,
        state: "APPROVED",
        doneBy: "manager",
        doneAt: NOW,
        transfer: { kind: "mercado_pago", operationNumber: "00123456" },
      },
    ]);
  });

  it.each([
    ["a cancelled sale", { origin: "sale_cancelled", method: "POINT" }],
    ["a late QR payment", { origin: "late_payment", method: "QR" }],
    ["a voided sale", { origin: "sale_voided", method: "QR" }],
    ["a return", { origin: "return", method: "POINT" }],
  ])("records the refund of %s, resolving its alert in the same transaction", async (_case, facts) => {
    const refund: FakeStoredRefund = { ...REFUSED_FOR_GOOD, ...facts };
    const store = new FakeRefundStore([{ ...refund }]);

    expect((await record(store)).kind).toBe("refunded_by_transfer");

    expect(store.operationOrder).toEqual([
      "lockRefund",
      "recordRefundDoneByTransfer",
      "resolveRefundAlert",
    ]);
    expect(store.resolvedAlerts).toEqual([
      {
        refundId: "refund-1",
        kind: facts.origin === "late_payment" ? "late_payment_refund" : "refund_task",
        resolvedBy: "manager",
        resolvedAt: NOW,
      },
    ]);
    expect(store.transactions).toBe(1);
  });

  it("answers not found for a refund that does not exist or belongs to another branch, writing nothing", async () => {
    const store = new FakeRefundStore([{ ...REFUSED_FOR_GOOD }]);

    expect(await record(store, { refundId: "refund-9" })).toEqual({ kind: "not_found" });
    expect(await record(store, { locationId: "branch-2" })).toEqual({ kind: "not_found" });
    expect(store.refunds).toEqual([REFUSED_FOR_GOOD]);
    expect(store.operationOrder).toEqual(["lockRefund", "lockRefund"]);
  });

  it("answers discarded for a discarded refund, leaving it as it was", async () => {
    const discarded: FakeStoredRefund = {
      ...REFUSED_FOR_GOOD,
      state: "DISCARDED",
      discardedBy: "other",
      discardedAt: CONFIRMED_AT,
    };
    const store = new FakeRefundStore([{ ...discarded }]);

    expect(await record(store)).toEqual({ kind: "discarded" });
    expect(store.refunds).toEqual([discarded]);
    expect(store.operationOrder).toEqual(["lockRefund"]);
  });

  it("answers already done for a refund done, leaving it as it was", async () => {
    const done: FakeStoredRefund = {
      ...REFUSED_FOR_GOOD,
      state: "APPROVED",
      doneBy: "other",
      doneAt: CONFIRMED_AT,
    };
    const store = new FakeRefundStore([{ ...done }]);

    expect(await record(store)).toEqual({ kind: "already_done" });
    expect(store.refunds).toEqual([done]);
    expect(store.operationOrder).toEqual(["lockRefund"]);
  });

  it.each([
    ["refused only for insufficient balance", { lastRefusalReason: "insufficient_balance" }],
    ["not confirmed yet", { confirmedAt: null, lastRefusalReason: null }],
    ["confirmed and waiting to be sent", { lastRefusalReason: null }],
    ["a late Point refund, which the cloud does not send", { origin: "late_payment", method: "POINT" }],
    ["a refund paid by transfer", { method: "TRANSFER", confirmedAt: null, lastRefusalReason: null }],
  ])("refuses a refund %s, leaving it as it was", async (_case, facts) => {
    const refund: FakeStoredRefund = { ...REFUSED_FOR_GOOD, ...facts };
    const store = new FakeRefundStore([{ ...refund }]);

    expect(await record(store)).toEqual({ kind: "not_refused_for_good" });
    expect(store.refunds).toEqual([refund]);
    expect(store.resolvedAlerts).toEqual([]);
    expect(store.operationOrder).toEqual(["lockRefund"]);
  });

  it("leaves the refund pending, with its alert open, if resolving the alert fails", async () => {
    const store = new FakeRefundStore([{ ...REFUSED_FOR_GOOD }]);
    store.failOn = "resolveRefundAlert";

    await expect(record(store)).rejects.toThrow("resolveRefundAlert failed");

    expect(store.refunds).toEqual([REFUSED_FOR_GOOD]);
    expect(store.resolvedAlerts).toEqual([]);
  });

  it("leaves the refund pending if recording it fails", async () => {
    const store = new FakeRefundStore([{ ...REFUSED_FOR_GOOD }]);
    store.failOn = "recordRefundDoneByTransfer";

    await expect(record(store)).rejects.toThrow("recordRefundDoneByTransfer failed");

    expect(store.refunds).toEqual([REFUSED_FOR_GOOD]);
  });
});
