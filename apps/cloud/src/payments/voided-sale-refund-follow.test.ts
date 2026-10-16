import { randomUUID } from "node:crypto";
import { applyPendingEvents } from "@purosur/domain/sync/use-cases";
import { describe, expect, it } from "vitest";
import { paymentRefunds, paymentTransactions, salePayments } from "../platform/db/schema.js";
import { syncedEventUpcaster } from "../sync/synced-event-upcaster.js";
import { eventApplicationUnderTest } from "../sync/test-support/drizzle-event-application.js";
import { AMOUNT, pushSaleThenItsVoiding } from "../sync/test-support/voided-sale-push.js";
import { buildJobHelpers } from "../test-support/job-helpers.js";
import {
  MERCADO_PAGO_REFUND_FOLLOW_TASK_IDENTIFIER,
  mercadoPagoRefundFollowJobs,
} from "./mercado-pago-refund-follow-task.js";
import { FakeMercadoPagoOrders, ORDER_ID } from "./test-support/fake-mercado-pago-orders.js";
import {
  pendingPointTransaction,
  pendingTransaction,
} from "./test-support/payment-transaction-fixtures.js";

const system = eventApplicationUnderTest();

async function pushedVoidOfSalePaidBy(method: "QR" | "POINT") {
  const { deviceId, locationId, registerId } = await system.enrollInstallation();
  const saleId = randomUUID();
  const paymentId = randomUUID();
  const backing = {
    id: paymentId,
    saleId,
    amount: AMOUNT,
    state: "APPROVED",
    providerOrderId: ORDER_ID,
  } as const;
  await system.db
    .insert(paymentTransactions)
    .values(
      method === "QR"
        ? pendingTransaction(registerId, backing)
        : pendingPointTransaction(registerId, backing),
    );
  await pushSaleThenItsVoiding(system.db, {
    deviceId,
    locationId,
    saleId,
    paymentId,
    method,
  });
}

async function applyEverything() {
  await applyPendingEvents(
    {
      eventApplication: system.application,
      upcaster: syncedEventUpcaster,
      clock: { now: () => new Date("2026-10-06T15:00:00.000Z") },
      quarantineNotices: { quarantined: () => {} },
    },
    { limit: 10 },
  );
}

async function followRefunds(mercadoPago: FakeMercadoPagoOrders) {
  const jobs = mercadoPagoRefundFollowJobs({
    now: () => new Date("2026-10-06T15:01:00.000Z"),
    mercadoPago,
    db: system.db,
    connections: { withConnection: (work) => work(system.db) },
  });
  const task = jobs.taskList[MERCADO_PAGO_REFUND_FOLLOW_TASK_IDENTIFIER];
  if (!task) {
    throw new Error("test setup: expected the refund follow task");
  }
  await task({}, buildJobHelpers().helpers);
}

describe("a pushed voiding of a sale paid by Mercado Pago", () => {
  it.each(["QR", "POINT"] as const)(
    "ends with Mercado Pago asked once to refund the %s order",
    async (method) => {
      await pushedVoidOfSalePaidBy(method);
      await applyEverything();
      const mercadoPago = new FakeMercadoPagoOrders();

      await followRefunds(mercadoPago);
      await followRefunds(mercadoPago);

      expect(mercadoPago.refunds).toHaveLength(1);
      expect(mercadoPago.refunds[0]?.orderId).toBe(ORDER_ID);
      const [refund] = await system.db.select().from(paymentRefunds);
      expect(refund).toMatchObject({
        state: "PENDING",
        sentAt: new Date("2026-10-06T15:01:00.000Z"),
      });
    },
  );

  it("asks Mercado Pago for nothing while the refund is held for more than the payment holds", async () => {
    await pushedVoidOfSalePaidBy("QR");
    await applyEverything();
    await system.db.update(salePayments).set({ amount: AMOUNT - 1 });
    const mercadoPago = new FakeMercadoPagoOrders();

    await followRefunds(mercadoPago);

    expect(mercadoPago.refunds).toEqual([]);
  });
});
