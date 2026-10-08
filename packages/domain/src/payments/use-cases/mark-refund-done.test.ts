import { describe, expect, it } from "vitest";
import { markRefundDone } from "./mark-refund-done.js";
import {
  FakeRefundStore,
  type FakeStoredRefund,
  FixedClock,
} from "./test-support/fake-refund-store.js";

const NOW = new Date("2026-10-08T14:00:00.000Z");
const PENDING: FakeStoredRefund = { id: "refund-1", locationId: "branch-1", state: "PENDING" };

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

    expect(store.operationOrder).toEqual(["lockRefund", "recordRefundDone"]);
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

  it("leaves the refund pending if recording it fails", async () => {
    const store = new FakeRefundStore([{ ...PENDING }]);
    store.failOn = "recordRefundDone";

    await expect(mark(store)).rejects.toThrow("recordRefundDone failed");

    expect(store.refunds).toEqual([PENDING]);
  });
});
