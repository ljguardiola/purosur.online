import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { alerts, paymentRefunds } from "../platform/db/schema.js";
import { signedInWith } from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { buildJobHelpers } from "../test-support/job-helpers.js";
import {
  MERCADO_PAGO_REFUND_FOLLOW_TASK_IDENTIFIER,
  MERCADO_PAGO_REFUND_FOLLOW_WATCHDOG_TASK_IDENTIFIER,
  mercadoPagoRefundFollowJobs,
} from "./mercado-pago-refund-follow-task.js";
import { FakeMercadoPagoOrders, NOW, ORDER_ID } from "./test-support/fake-mercado-pago-orders.js";
import { aPendingLatePaymentRefund } from "./test-support/late-payment-refund-fixtures.js";
import { aPendingQrRefundOfCancelledSale } from "./test-support/qr-refund-fixtures.js";

const NEXT_FOLLOW_AT = new Date(NOW.getTime() + 60_000);

let testDatabase: TestDatabase;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

function jobsOf(mercadoPago = new FakeMercadoPagoOrders(), follow?: () => Promise<unknown>) {
  return mercadoPagoRefundFollowJobs(
    {
      now: () => NOW,
      mercadoPago,
      db: testDatabase.db,
      connections: { withConnection: (work) => work(testDatabase.db) },
    },
    follow ? { follow } : {},
  );
}

function taskOf(jobs: ReturnType<typeof jobsOf>, identifier: string) {
  const task = jobs.taskList[identifier];
  if (!task) {
    throw new Error(`test setup: expected the registered task ${identifier}`);
  }
  return task;
}

describe("mercadoPagoRefundFollowJobs", () => {
  it("registers the follow and its watchdog, and runs the watchdog every minute", () => {
    const jobs = jobsOf();

    expect(jobs.taskList[MERCADO_PAGO_REFUND_FOLLOW_TASK_IDENTIFIER]).toBeInstanceOf(Function);
    expect(jobs.taskList[MERCADO_PAGO_REFUND_FOLLOW_WATCHDOG_TASK_IDENTIFIER]).toBeInstanceOf(
      Function,
    );
    expect(jobs.crontab).toEqual(["* * * * * mercado-pago-refund-follow-watchdog"]);
  });

  it("sends a refund a person confirmed that Mercado Pago could not be reached for, and records what it answers", async () => {
    const pending = await aPendingQrRefundOfCancelledSale(testDatabase.db, { cancelledAt: NOW });
    const { userId } = await signedInWith(testDatabase.db, ["confirm_refunds"], NOW);
    await testDatabase.db
      .update(paymentRefunds)
      .set({ confirmedBy: userId, confirmedAt: NOW, attemptKey: "key-1" })
      .where(eq(paymentRefunds.id, pending.refundId));
    const mercadoPago = new FakeMercadoPagoOrders();

    await taskOf(jobsOf(mercadoPago), MERCADO_PAGO_REFUND_FOLLOW_TASK_IDENTIFIER)(
      {},
      buildJobHelpers().helpers,
    );

    expect(mercadoPago.refunds).toEqual([{ orderId: ORDER_ID, idempotencyKey: "key-1" }]);
    const [refund] = await testDatabase.db
      .select()
      .from(paymentRefunds)
      .where(eq(paymentRefunds.id, pending.refundId));
    expect(refund).toMatchObject({ state: "PENDING", sentAt: NOW });
  });

  it("marks a refund Mercado Pago processed as done by whoever confirmed it", async () => {
    const pending = await aPendingQrRefundOfCancelledSale(testDatabase.db, { cancelledAt: NOW });
    const { userId } = await signedInWith(testDatabase.db, ["confirm_refunds"], NOW);
    await testDatabase.db
      .update(paymentRefunds)
      .set({
        confirmedBy: userId,
        confirmedAt: NOW,
        attemptKey: "key-1",
        sentAt: NOW,
        providerRefundId: "REF-1",
      })
      .where(eq(paymentRefunds.id, pending.refundId));
    const mercadoPago = new FakeMercadoPagoOrders();
    mercadoPago.orderRefunds = { kind: "read", refunds: [{ id: "REF-1", status: "processed" }] };

    await taskOf(jobsOf(mercadoPago), MERCADO_PAGO_REFUND_FOLLOW_TASK_IDENTIFIER)(
      {},
      buildJobHelpers().helpers,
    );

    const [refund] = await testDatabase.db
      .select()
      .from(paymentRefunds)
      .where(eq(paymentRefunds.id, pending.refundId));
    expect(refund).toMatchObject({ state: "APPROVED", doneBy: userId, doneAt: NOW });
  });

  it("never sends a refund nobody confirmed", async () => {
    await aPendingQrRefundOfCancelledSale(testDatabase.db, { cancelledAt: NOW });
    const mercadoPago = new FakeMercadoPagoOrders();

    await taskOf(jobsOf(mercadoPago), MERCADO_PAGO_REFUND_FOLLOW_TASK_IDENTIFIER)(
      {},
      buildJobHelpers().helpers,
    );

    expect(mercadoPago.refunds).toEqual([]);
    expect(mercadoPago.refundReadings).toEqual([]);
  });

  describe("a late QR payment refund", () => {
    async function runFollow(mercadoPago: FakeMercadoPagoOrders) {
      await taskOf(jobsOf(mercadoPago), MERCADO_PAGO_REFUND_FOLLOW_TASK_IDENTIFIER)(
        {},
        buildJobHelpers().helpers,
      );
    }

    async function stored(refundId: string) {
      const [refund] = await testDatabase.db
        .select()
        .from(paymentRefunds)
        .where(eq(paymentRefunds.id, refundId));
      return refund;
    }

    it("is sent with its key once a person confirmed it, and recorded as sent", async () => {
      const late = await aPendingLatePaymentRefund(testDatabase.db, {
        openedAt: NOW,
        orderId: ORDER_ID,
      });
      const { userId } = await signedInWith(testDatabase.db, ["confirm_refunds"], NOW);
      await testDatabase.db
        .update(paymentRefunds)
        .set({ confirmedBy: userId, confirmedAt: NOW, attemptKey: "key-1" })
        .where(eq(paymentRefunds.id, late.refundId));
      const mercadoPago = new FakeMercadoPagoOrders();

      await runFollow(mercadoPago);

      expect(mercadoPago.refunds).toEqual([{ orderId: ORDER_ID, idempotencyKey: "key-1" }]);
      expect(await stored(late.refundId)).toMatchObject({ state: "PENDING", sentAt: NOW });
    });

    it("is done, with its late-payment alert resolved, once Mercado Pago shows it processed", async () => {
      const late = await aPendingLatePaymentRefund(testDatabase.db, {
        openedAt: NOW,
        orderId: ORDER_ID,
      });
      const { userId } = await signedInWith(testDatabase.db, ["confirm_refunds"], NOW);
      await testDatabase.db
        .update(paymentRefunds)
        .set({
          confirmedBy: userId,
          confirmedAt: NOW,
          attemptKey: "key-1",
          sentAt: NOW,
          providerRefundId: "REF-1",
        })
        .where(eq(paymentRefunds.id, late.refundId));
      const mercadoPago = new FakeMercadoPagoOrders();
      mercadoPago.orderRefunds = { kind: "read", refunds: [{ id: "REF-1", status: "processed" }] };

      await runFollow(mercadoPago);

      expect(await stored(late.refundId)).toMatchObject({ state: "APPROVED", doneBy: userId });
      const [alert] = await testDatabase.db
        .select()
        .from(alerts)
        .where(eq(alerts.id, late.alertId));
      expect(alert).toMatchObject({ resolvedAt: NOW, resolvedBy: userId });
    });
  });

  it("schedules the next follow a minute on, replacing any already scheduled under its key", async () => {
    const { helpers, addJob } = buildJobHelpers();

    await taskOf(jobsOf(), MERCADO_PAGO_REFUND_FOLLOW_TASK_IDENTIFIER)({}, helpers);

    expect(addJob).toHaveBeenCalledWith(
      MERCADO_PAGO_REFUND_FOLLOW_TASK_IDENTIFIER,
      {},
      {
        jobKey: MERCADO_PAGO_REFUND_FOLLOW_TASK_IDENTIFIER,
        jobKeyMode: "replace",
        runAt: NEXT_FOLLOW_AT,
      },
    );
  });

  it("schedules the next follow even when this one failed", async () => {
    const { helpers, addJob } = buildJobHelpers();
    const jobs = jobsOf(undefined, vi.fn().mockRejectedValue(new Error("store down")));

    await expect(
      taskOf(jobs, MERCADO_PAGO_REFUND_FOLLOW_TASK_IDENTIFIER)({}, helpers),
    ).rejects.toThrow("store down");

    expect(addJob).toHaveBeenCalledTimes(1);
  });

  it("has the watchdog add the follow under the same key, keeping the run time of one already scheduled", async () => {
    const { helpers, addJob } = buildJobHelpers();

    await taskOf(jobsOf(), MERCADO_PAGO_REFUND_FOLLOW_WATCHDOG_TASK_IDENTIFIER)({}, helpers);

    expect(addJob).toHaveBeenCalledWith(
      MERCADO_PAGO_REFUND_FOLLOW_TASK_IDENTIFIER,
      {},
      { jobKey: MERCADO_PAGO_REFUND_FOLLOW_TASK_IDENTIFIER, jobKeyMode: "preserve_run_at" },
    );
  });
});
