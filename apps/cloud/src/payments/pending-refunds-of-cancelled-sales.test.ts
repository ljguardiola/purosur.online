import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { alerts, paymentRefunds } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { lockPendingRefundsOfCancelledSalesWithoutRefundTaskAlert } from "./pending-refunds-of-cancelled-sales.js";
import { aPendingRefundOfCancelledSale } from "./test-support/cancelled-sale-refund-fixtures.js";
import { aPendingLatePaymentRefund } from "./test-support/late-payment-refund-fixtures.js";
import { aPendingRefundOfVoidedSale } from "./test-support/voided-sale-refund-fixtures.js";

const CANCELLED_AT = new Date("2026-10-07T15:00:00.000Z");

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

const lockRefunds = () =>
  db.transaction((tx) => lockPendingRefundsOfCancelledSalesWithoutRefundTaskAlert(tx));

describe("lockPendingRefundsOfCancelledSalesWithoutRefundTaskAlert", () => {
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
});
