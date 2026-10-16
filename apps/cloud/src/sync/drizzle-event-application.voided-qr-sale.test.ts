import { randomUUID } from "node:crypto";
import { applyPendingEvents } from "@purosur/domain/sync/use-cases";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { pendingTransaction } from "../payments/test-support/payment-transaction-fixtures.js";
import { paymentRefunds, paymentTransactions, sales, users } from "../platform/db/schema.js";
import { syncedEventUpcaster } from "./synced-event-upcaster.js";
import { eventApplicationUnderTest } from "./test-support/drizzle-event-application.js";
import { insertInboxEvent } from "./test-support/inbox-events.js";

const system = eventApplicationUnderTest();

const CASHIER = "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03";
const COMPLETED_AT = "2026-10-06T11:20:00.000Z";
const VOIDED_AT = "2026-10-06T11:40:00.000Z";
const AMOUNT = 30_700;

function qrPayment(paymentId: string) {
  return {
    id: paymentId,
    kind: "SALE",
    method: "QR",
    provider: "MERCADOPAGO_QR",
    amount: AMOUNT,
    tendered: null,
    state: "APPROVED",
    occurred_at: COMPLETED_AT,
    authorized_by: null,
    confirmed_at: null,
  };
}

async function pushQrSaleThenItsVoiding(options: {
  deviceId: string;
  locationId: string;
  saleId: string;
  paymentId: string;
}) {
  const sessionId = randomUUID();
  const registerId = randomUUID();
  await system.db
    .insert(users)
    .values({
      id: CASHIER,
      firstName: "Ada",
      email: "ada@example.com",
      locationId: options.locationId,
    })
    .onConflictDoNothing();
  await insertInboxEvent(system.db, options.deviceId, {
    aggregateType: "CashSession",
    aggregateId: sessionId,
    eventType: "cash_session_opened",
    schemaVersion: 1,
    payload: { opened_by: CASHIER, opened_at: COMPLETED_AT, opening_float: 10_000 },
  });
  await insertInboxEvent(system.db, options.deviceId, {
    aggregateId: options.saleId,
    schemaVersion: 5,
    payload: {
      id: options.saleId,
      operation_number: 1,
      register_id: registerId,
      device_id: options.deviceId,
      session_id: sessionId,
      actor_id: CASHIER,
      occurred_at: COMPLETED_AT,
      total: AMOUNT,
      lines: [],
      cash_movements: [],
      stock_movements: [],
      payments: [qrPayment(options.paymentId)],
    },
  });
  return insertInboxEvent(system.db, options.deviceId, {
    aggregateId: options.saleId,
    eventType: "sale_voided",
    schemaVersion: 2,
    occurredAt: new Date(VOIDED_AT),
    payload: {
      id: options.saleId,
      register_id: registerId,
      device_id: options.deviceId,
      session_id: sessionId,
      actor_id: CASHIER,
      authorized_by: null,
      occurred_at: VOIDED_AT,
      total: AMOUNT,
      sale_discount: null,
      lines: [],
      payments: [qrPayment(options.paymentId)],
      refunds: [
        {
          id: randomUUID(),
          kind: "REFUND",
          parent_id: options.paymentId,
          method: "QR",
          provider: "MERCADOPAGO_QR",
          amount: AMOUNT,
          state: "PENDING",
          occurred_at: VOIDED_AT,
        },
      ],
      cash_movements: [],
      stock_movements: [],
      deferred_record_cancelled: false,
    },
  });
}

describe("applying a pushed voiding of a sale paid by Mercado Pago QR", () => {
  it("voids the sale and records the QR refund as pending", async () => {
    const { deviceId, locationId, registerId } = await system.enrollInstallation();
    const saleId = randomUUID();
    const backing = pendingTransaction(registerId, {
      id: randomUUID(),
      saleId,
      amount: AMOUNT,
      state: "APPROVED",
    });
    await system.db.insert(paymentTransactions).values(backing);
    await pushQrSaleThenItsVoiding({ deviceId, locationId, saleId, paymentId: backing.id });

    const outcome = await applyPendingEvents(
      {
        eventApplication: system.application,
        upcaster: syncedEventUpcaster,
        clock: { now: () => new Date("2026-10-06T15:00:00.000Z") },
        quarantineNotices: { quarantined: () => {} },
      },
      { limit: 10 },
    );

    expect(outcome).toMatchObject({ kind: "processed", applied: 3, retried: 0 });
    const [sale] = await system.db.select().from(sales).where(eq(sales.id, saleId));
    expect(sale).toMatchObject({ state: "VOIDED", total: AMOUNT });
    expect(await system.db.select().from(paymentRefunds)).toEqual([
      expect.objectContaining({
        saleId,
        paymentId: backing.id,
        origin: "sale_voided",
        method: "QR",
        provider: "MERCADOPAGO_QR",
        amount: AMOUNT,
        state: "PENDING",
      }),
    ]);
  });
});
