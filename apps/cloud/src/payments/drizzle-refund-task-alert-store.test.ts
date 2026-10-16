import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { alerts, paymentRefunds } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleRefundTaskAlertStore } from "./drizzle-refund-task-alert-store.js";
import { aPendingRefundOfCancelledSale } from "./test-support/cancelled-sale-refund-fixtures.js";
import { aPendingLatePaymentRefund } from "./test-support/late-payment-refund-fixtures.js";
import { aPendingRefundOfVoidedSale } from "./test-support/voided-sale-refund-fixtures.js";

const CANCELLED_AT = new Date("2026-10-07T15:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;

let testDatabase: TestDatabase;
let db: TestDatabase["db"];

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

const store = () => new DrizzleRefundTaskAlertStore(db);
const lockRefunds = () =>
  store().transaction((tx) => tx.lockPendingRefundsOfCancelledSalesWithoutRefundTaskAlert());

describe("DrizzleRefundTaskAlertStore", () => {
  it("locks the pending refund of a cancelled sale, with the branch of the sale and when the refund opened", async () => {
    const refund = await aPendingRefundOfCancelledSale(db, { cancelledAt: CANCELLED_AT });

    expect(await lockRefunds()).toEqual([
      {
        refundId: refund.refundId,
        saleId: refund.saleId,
        locationId: refund.locationId,
        origin: "sale_cancelled",
        method: "TRANSFER",
        amount: refund.amount,
        openedAt: CANCELLED_AT,
        confirmedAt: null,
        lastRefusalReason: null,
      },
    ]);
  });

  it("locks the pending refund of a voided sale just like a cancelled one's", async () => {
    const refund = await aPendingRefundOfVoidedSale(db, { voidedAt: CANCELLED_AT });

    expect(await lockRefunds()).toEqual([
      {
        refundId: refund.refundId,
        saleId: refund.saleId,
        locationId: refund.locationId,
        origin: "sale_voided",
        method: "TRANSFER",
        amount: 2_000,
        openedAt: CANCELLED_AT,
        confirmedAt: null,
        lastRefusalReason: null,
      },
    ]);
  });

  it("locks a confirmed refund with when it was confirmed", async () => {
    const refund = await aPendingRefundOfVoidedSale(db, { voidedAt: CANCELLED_AT });
    await db
      .update(paymentRefunds)
      .set({ confirmedBy: "cashier-1", confirmedAt: CANCELLED_AT })
      .where(eq(paymentRefunds.id, refund.refundId));

    expect(await lockRefunds()).toEqual([
      expect.objectContaining({ refundId: refund.refundId, confirmedAt: CANCELLED_AT }),
    ]);
  });

  it("locks a refund Mercado Pago refused with the reason it gave", async () => {
    const refund = await aPendingRefundOfVoidedSale(db, { voidedAt: CANCELLED_AT });
    await db
      .update(paymentRefunds)
      .set({
        confirmedBy: "cashier-1",
        confirmedAt: CANCELLED_AT,
        lastRefusalReason: "rejected_by_bank",
      })
      .where(eq(paymentRefunds.id, refund.refundId));

    expect(await lockRefunds()).toEqual([
      expect.objectContaining({ refundId: refund.refundId, lastRefusalReason: "rejected_by_bank" }),
    ]);
  });

  it("leaves out a refund already marked done", async () => {
    const refund = await aPendingRefundOfCancelledSale(db, { cancelledAt: CANCELLED_AT });
    await db
      .update(paymentRefunds)
      .set({ state: "APPROVED", doneBy: "someone", doneAt: CANCELLED_AT })
      .where(eq(paymentRefunds.id, refund.refundId));

    expect(await lockRefunds()).toEqual([]);
  });

  it("leaves out the refund of a payment that arrived late, which has its own alert", async () => {
    await aPendingLatePaymentRefund(db, { openedAt: CANCELLED_AT });

    expect(await lockRefunds()).toEqual([]);
  });

  it("leaves out a refund that already has its alert open", async () => {
    const refund = await aPendingRefundOfCancelledSale(db, { cancelledAt: CANCELLED_AT });
    await db.insert(alerts).values({
      kind: "refund_task",
      scope: refund.refundId,
      level: "warning",
      audience: "local",
      locationId: refund.locationId,
      detail: {},
      openedAt: CANCELLED_AT,
    });

    expect(await lockRefunds()).toEqual([]);
  });

  it("opens the alert for the refund in the sale's branch, with the level it is given and escalating 72 hours after the refund opened", async () => {
    const refund = await aPendingRefundOfCancelledSale(db, { cancelledAt: CANCELLED_AT });
    const openedAt = new Date(CANCELLED_AT.getTime() + 30 * HOUR_MS);

    await store().transaction(async (tx) => {
      const [locked] = await tx.lockPendingRefundsOfCancelledSalesWithoutRefundTaskAlert();
      if (!locked) {
        throw new Error("test setup: no refund was locked");
      }
      await tx.openRefundTaskAlert(locked, "critical", openedAt);
    });

    const [alert] = await db.select().from(alerts);
    expect(alert).toMatchObject({
      kind: "refund_task",
      scope: refund.refundId,
      level: "critical",
      audience: "local",
      locationId: refund.locationId,
      openedAt,
      escalateAt: new Date(CANCELLED_AT.getTime() + 72 * HOUR_MS),
      detail: {
        saleId: refund.saleId,
        amount: refund.amount,
        method: "TRANSFER",
        refundOpenedAt: CANCELLED_AT.toISOString(),
      },
    });
  });

  it("opens no second alert while one is already open for the refund", async () => {
    await aPendingRefundOfCancelledSale(db, { cancelledAt: CANCELLED_AT });
    const openIt = () =>
      store().transaction(async (tx) => {
        const [locked] = await tx.lockPendingRefundsOfCancelledSalesWithoutRefundTaskAlert();
        if (locked) {
          await tx.openRefundTaskAlert(locked, "warning", CANCELLED_AT);
        }
      });

    await openIt();
    await openIt();

    expect(await db.select().from(alerts)).toHaveLength(1);
  });
});
