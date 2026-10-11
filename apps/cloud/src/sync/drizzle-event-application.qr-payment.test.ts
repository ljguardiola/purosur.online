import { randomUUID } from "node:crypto";
import { applyPendingEvents } from "@purosur/domain/sync/use-cases";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { pendingTransaction } from "../payments/test-support/payment-transaction-fixtures.js";
import { inbox, paymentTransactions, salePayments, sales, users } from "../platform/db/schema.js";
import { syncedEventUpcaster } from "./synced-event-upcaster.js";
import { eventApplicationUnderTest } from "./test-support/drizzle-event-application.js";
import { insertInboxEvent } from "./test-support/inbox-events.js";

const system = eventApplicationUnderTest();

const CASHIER = "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03";
const OCCURRED_AT = "2026-10-06T11:20:00.000Z";
const AMOUNT = 30_700;

async function pushSaleCharged(options: {
  deviceId: string;
  locationId: string;
  saleId: string;
  paymentId: string;
  amount: number;
}): Promise<string> {
  const sessionId = randomUUID();
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
    payload: { opened_by: CASHIER, opened_at: OCCURRED_AT, opening_float: 10_000 },
  });
  return insertInboxEvent(system.db, options.deviceId, {
    aggregateId: options.saleId,
    schemaVersion: 5,
    payload: {
      id: options.saleId,
      operation_number: 1,
      register_id: randomUUID(),
      device_id: options.deviceId,
      session_id: sessionId,
      actor_id: CASHIER,
      occurred_at: OCCURRED_AT,
      total: options.amount,
      lines: [],
      cash_movements: [],
      stock_movements: [],
      payments: [
        {
          id: options.paymentId,
          kind: "SALE",
          method: "QR",
          provider: "MERCADOPAGO_QR",
          amount: options.amount,
          tendered: null,
          state: "APPROVED",
          occurred_at: OCCURRED_AT,
          authorized_by: null,
          confirmed_at: null,
        },
      ],
    },
  });
}

function applyPending() {
  return applyPendingEvents(
    {
      eventApplication: system.application,
      upcaster: syncedEventUpcaster,
      clock: { now: () => new Date("2026-10-06T15:00:00.000Z") },
      quarantineNotices: { quarantined: () => {} },
    },
    { limit: 10 },
  );
}

describe("applying a pushed sale paid by Mercado Pago QR", () => {
  async function chargedByTransaction(
    transaction: (registerId: string, saleId: string) => ReturnType<typeof pendingTransaction>,
  ) {
    const { deviceId, locationId, registerId } = await system.enrollInstallation();
    const saleId = randomUUID();
    const backing = transaction(registerId, saleId);
    await system.db.insert(paymentTransactions).values(backing);
    const eventId = await pushSaleCharged({
      deviceId,
      locationId,
      saleId,
      paymentId: backing.id,
      amount: AMOUNT,
    });
    return { eventId, saleId, paymentId: backing.id };
  }

  it("applies the sale, keeping its QR payment like any other, when its own approved transaction backs it", async () => {
    const { eventId, saleId, paymentId } = await chargedByTransaction((registerId, saleId) =>
      pendingTransaction(registerId, {
        id: randomUUID(),
        saleId,
        amount: AMOUNT,
        state: "APPROVED",
      }),
    );

    const outcome = await applyPending();

    expect(outcome).toMatchObject({ kind: "processed", applied: 2, retried: 0 });
    const [sale] = await system.db.select().from(sales).where(eq(sales.id, saleId));
    expect(sale).toMatchObject({ state: "COMPLETED", total: AMOUNT });
    const [payment] = await system.db.select().from(salePayments);
    expect(payment).toMatchObject({
      id: paymentId,
      saleId,
      method: "QR",
      provider: "MERCADOPAGO_QR",
      amount: AMOUNT,
      tendered: null,
      state: "APPROVED",
    });
    const [event] = await system.db.select().from(inbox).where(eq(inbox.eventId, eventId));
    expect(event?.appliedAt).not.toBeNull();
  });

  it.each([
    [
      "is still pending",
      (registerId: string, saleId: string) =>
        pendingTransaction(registerId, { saleId, amount: AMOUNT, state: "PENDING" }),
    ],
    [
      "is declined",
      (registerId: string, saleId: string) =>
        pendingTransaction(registerId, { saleId, amount: AMOUNT, state: "DECLINED" }),
    ],
    [
      "belongs to another sale",
      (registerId: string) => pendingTransaction(registerId, { amount: AMOUNT, state: "APPROVED" }),
    ],
    [
      "is for another amount",
      (registerId: string, saleId: string) =>
        pendingTransaction(registerId, { saleId, amount: AMOUNT - 100, state: "APPROVED" }),
    ],
  ])(
    "applies nothing, and retries the event, when the transaction %s",
    async (_description, transaction) => {
      const { eventId } = await chargedByTransaction(transaction);

      const outcome = await applyPending();

      expect(outcome).toMatchObject({ kind: "processed", applied: 1, retried: 1 });
      const [event] = await system.db.select().from(inbox).where(eq(inbox.eventId, eventId));
      expect(event).toMatchObject({ appliedAt: null, attempts: 1 });
      expect(event?.lastError).toMatch(/not backed by an approved Mercado Pago transaction/);
      expect(await system.db.select().from(sales)).toEqual([]);
      expect(await system.db.select().from(salePayments)).toEqual([]);
    },
  );

  it("applies nothing, and retries the event, when the provider has no transaction for the payment", async () => {
    const { deviceId, locationId } = await system.enrollInstallation();
    const eventId = await pushSaleCharged({
      deviceId,
      locationId,
      saleId: randomUUID(),
      paymentId: randomUUID(),
      amount: AMOUNT,
    });

    const outcome = await applyPending();

    expect(outcome).toMatchObject({ kind: "processed", retried: 1 });
    const [event] = await system.db.select().from(inbox).where(eq(inbox.eventId, eventId));
    expect(event?.appliedAt).toBeNull();
    expect(await system.db.select().from(sales)).toEqual([]);
  });
});
