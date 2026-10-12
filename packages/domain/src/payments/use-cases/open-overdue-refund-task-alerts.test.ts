import { describe, expect, it } from "vitest";
import { openOverdueRefundTaskAlerts } from "./open-overdue-refund-task-alerts.js";
import { FixedClock } from "./test-support/fake-refund-store.js";
import {
  type FakeRefundOfSale,
  FakeRefundTaskAlertStore,
} from "./test-support/fake-refund-task-alert-store.js";

const REFUND_OPENED = new Date("2026-10-01T08:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;

const REFUND: FakeRefundOfSale = {
  refundId: "refund-1",
  saleId: "sale-1",
  locationId: "branch-1",
  method: "TRANSFER",
  amount: 12400,
  openedAt: REFUND_OPENED,
  origin: "sale_cancelled",
  state: "PENDING",
  hasOpenRefundTaskAlert: false,
};

function hoursAfterOpening(hours: number, milliseconds = 0): Date {
  return new Date(REFUND_OPENED.getTime() + hours * HOUR_MS + milliseconds);
}

function evaluate(store: FakeRefundTaskAlertStore, now: Date) {
  return openOverdueRefundTaskAlerts({ store, clock: new FixedClock(now) });
}

describe("openOverdueRefundTaskAlerts", () => {
  it("opens nothing for a refund that has been pending for less than 24 hours", async () => {
    const store = new FakeRefundTaskAlertStore([{ ...REFUND }]);

    expect(await evaluate(store, hoursAfterOpening(24, -1))).toEqual({
      kind: "opened",
      refundIds: [],
    });
    expect(store.opened).toEqual([]);
  });

  it("opens a warning for the sale's branch when a refund has been pending for 24 hours", async () => {
    const store = new FakeRefundTaskAlertStore([{ ...REFUND }]);
    const now = hoursAfterOpening(24);

    expect(await evaluate(store, now)).toEqual({ kind: "opened", refundIds: ["refund-1"] });
    expect(store.opened).toEqual([
      {
        refundId: "refund-1",
        saleId: "sale-1",
        locationId: "branch-1",
        method: "TRANSFER",
        amount: 12400,
        refundOpenedAt: REFUND_OPENED,
        level: "warning",
        openedAt: now,
      },
    ]);
  });

  it("opens it already critical when the refund has been pending for 72 hours or more", async () => {
    const store = new FakeRefundTaskAlertStore([{ ...REFUND }]);

    await evaluate(store, hoursAfterOpening(72));

    expect(store.opened.map((alert) => alert.level)).toEqual(["critical"]);
  });

  it("opens nothing for a refund of a payment that arrived late, which has its own alert", async () => {
    const store = new FakeRefundTaskAlertStore([{ ...REFUND, origin: "late_payment" }]);

    await evaluate(store, hoursAfterOpening(100));

    expect(store.opened).toEqual([]);
  });

  it.each(["APPROVED", "DISCARDED"] as const)("opens nothing for a refund already %s", async (state) => {
    const store = new FakeRefundTaskAlertStore([{ ...REFUND, state }]);

    await evaluate(store, hoursAfterOpening(100));

    expect(store.opened).toEqual([]);
  });

  it("does not open a second alert for a refund that already has one open", async () => {
    const store = new FakeRefundTaskAlertStore([{ ...REFUND }]);
    await evaluate(store, hoursAfterOpening(24));

    expect(await evaluate(store, hoursAfterOpening(25))).toEqual({ kind: "opened", refundIds: [] });
    expect(store.opened).toHaveLength(1);
  });

  it("opens an alert for each overdue refund and none for one still within its first day", async () => {
    const store = new FakeRefundTaskAlertStore([
      { ...REFUND },
      { ...REFUND, refundId: "refund-2", openedAt: hoursAfterOpening(30) },
      { ...REFUND, refundId: "refund-3", locationId: "branch-2" },
    ]);

    const outcome = await evaluate(store, hoursAfterOpening(48));

    expect(outcome).toEqual({ kind: "opened", refundIds: ["refund-1", "refund-3"] });
    expect(store.opened.map((alert) => alert.locationId)).toEqual(["branch-1", "branch-2"]);
  });

  it("locks the refunds before opening any alert, all in one transaction", async () => {
    const store = new FakeRefundTaskAlertStore([{ ...REFUND }]);

    await evaluate(store, hoursAfterOpening(24));

    expect(store.operationOrder).toEqual(["lockRefunds", "openRefundTaskAlert"]);
    expect(store.transactions).toBe(1);
  });

  it("opens no alert at all when opening one fails", async () => {
    const store = new FakeRefundTaskAlertStore([
      { ...REFUND },
      { ...REFUND, refundId: "refund-2" },
    ]);
    store.failOn = "openRefundTaskAlert";

    await expect(evaluate(store, hoursAfterOpening(24))).rejects.toThrow(
      "openRefundTaskAlert failed",
    );

    expect(store.opened).toEqual([]);
  });
});
