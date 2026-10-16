import { randomUUID } from "node:crypto";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { users } from "../../platform/db/schema.js";
import { insertInboxEvent } from "./inbox-events.js";

export const CASHIER = "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03";
export const SUPERVISOR = "4a7c1e9d-3b62-4f05-8d1a-6e2b9c5f3a13";
const COMPLETED_AT = "2026-10-06T11:20:00.000Z";
export const VOIDED_AT = "2026-10-06T11:40:00.000Z";
export const AMOUNT = 30_700;

const PROVIDER_OF = {
  QR: "MERCADOPAGO_QR",
  POINT: "MERCADOPAGO_POINT",
  TRANSFER: "NONE",
} as const;

export type PaymentMethodOfPush = keyof typeof PROVIDER_OF;

function paymentOf(paymentId: string, method: PaymentMethodOfPush) {
  return {
    id: paymentId,
    kind: "SALE",
    method,
    provider: PROVIDER_OF[method],
    amount: AMOUNT,
    tendered: null,
    state: "APPROVED",
    occurred_at: COMPLETED_AT,
    authorized_by: method === "TRANSFER" ? SUPERVISOR : null,
    confirmed_at: method === "TRANSFER" ? COMPLETED_AT : null,
  };
}

export async function pushSaleThenItsVoiding<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  options: {
    deviceId: string;
    locationId: string;
    saleId: string;
    paymentId: string;
    method: PaymentMethodOfPush;
    authorizedBy?: string;
  },
): Promise<void> {
  const sessionId = randomUUID();
  const registerId = randomUUID();
  await db
    .insert(users)
    .values({
      id: CASHIER,
      firstName: "Ada",
      email: "ada@example.com",
      locationId: options.locationId,
    })
    .onConflictDoNothing();
  await insertInboxEvent(db, options.deviceId, {
    aggregateType: "CashSession",
    aggregateId: sessionId,
    eventType: "cash_session_opened",
    schemaVersion: 1,
    payload: { opened_by: CASHIER, opened_at: COMPLETED_AT, opening_float: 10_000 },
  });
  await insertInboxEvent(db, options.deviceId, {
    aggregateId: options.saleId,
    schemaVersion: 8,
    payload: {
      id: options.saleId,
      operation_number: 1,
      register_id: registerId,
      device_id: options.deviceId,
      session_id: sessionId,
      actor_id: CASHIER,
      occurred_at: COMPLETED_AT,
      total: AMOUNT,
      sale_discount: null,
      lines: [],
      cash_movements: [],
      stock_movements: [],
      payments: [paymentOf(options.paymentId, options.method)],
    },
  });
  await insertInboxEvent(db, options.deviceId, {
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
      authorized_by: options.authorizedBy ?? null,
      occurred_at: VOIDED_AT,
      total: AMOUNT,
      sale_discount: null,
      lines: [],
      payments: [paymentOf(options.paymentId, options.method)],
      refunds: [
        {
          id: randomUUID(),
          kind: "REFUND",
          parent_id: options.paymentId,
          method: options.method,
          provider: PROVIDER_OF[options.method],
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
