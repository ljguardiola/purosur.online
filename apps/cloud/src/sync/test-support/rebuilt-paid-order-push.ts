import { randomUUID } from "node:crypto";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { users } from "../../platform/db/schema.js";
import { insertInboxEvent } from "./inbox-events.js";

const CASHIER = "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03";
const OCCURRED_AT = "2026-10-06T11:20:00.000Z";

export interface RebuiltSalePush {
  deviceId: string;
  locationId: string;
  saleId: string;
  paymentTransactionId: string;
  applied: number;
  surplus: number;
  schemaVersion?: number;
}

async function openSession<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  { deviceId, locationId }: Pick<RebuiltSalePush, "deviceId" | "locationId">,
): Promise<string> {
  const sessionId = randomUUID();
  await db
    .insert(users)
    .values({ id: CASHIER, firstName: "Ada", email: "ada@example.com", locationId })
    .onConflictDoNothing();
  await insertInboxEvent(db, deviceId, {
    aggregateType: "CashSession",
    aggregateId: sessionId,
    eventType: "cash_session_opened",
    schemaVersion: 1,
    payload: { opened_by: CASHIER, opened_at: OCCURRED_AT, opening_float: 10_000 },
  });
  return sessionId;
}

function qrPayment({ paymentTransactionId, applied }: RebuiltSalePush) {
  return {
    id: paymentTransactionId,
    kind: "SALE",
    method: "QR",
    provider: "MERCADOPAGO_QR",
    amount: applied,
    tendered: null,
    state: "APPROVED",
    occurred_at: OCCURRED_AT,
    authorized_by: null,
    confirmed_at: null,
  };
}

export async function pushRebuiltSaleCompleted<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  push: RebuiltSalePush,
  sessionId?: string,
): Promise<string> {
  const session = sessionId ?? (await openSession(db, push));
  return insertInboxEvent(db, push.deviceId, {
    aggregateId: push.saleId,
    eventType: "sale_completed",
    schemaVersion: push.schemaVersion ?? 10,
    payload: {
      id: push.saleId,
      operation_number: 1,
      register_id: randomUUID(),
      device_id: push.deviceId,
      session_id: session,
      actor_id: CASHIER,
      occurred_at: OCCURRED_AT,
      total: push.applied,
      lines: [],
      cash_movements: [],
      stock_movements: [],
      payments: [qrPayment(push)],
      rebuilt_paid_order: {
        payment_transaction_id: push.paymentTransactionId,
        surplus: push.surplus,
      },
    },
  });
}

export async function pushRebuiltSaleCancelled<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  push: RebuiltSalePush,
): Promise<string> {
  const sessionId = await openSession(db, push);
  return insertInboxEvent(db, push.deviceId, {
    aggregateId: push.saleId,
    eventType: "sale_cancelled",
    schemaVersion: push.schemaVersion ?? 10,
    payload: {
      id: push.saleId,
      register_id: randomUUID(),
      device_id: push.deviceId,
      session_id: sessionId,
      actor_id: CASHIER,
      authorized_by: null,
      occurred_at: OCCURRED_AT,
      total: push.applied,
      sale_discount: null,
      lines: [],
      cash_movements: [],
      payments: [qrPayment(push)],
      refunds: [
        {
          id: randomUUID(),
          kind: "REFUND",
          parent_id: push.paymentTransactionId,
          method: "QR",
          provider: "MERCADOPAGO_QR",
          amount: push.applied,
          state: "PENDING",
          occurred_at: OCCURRED_AT,
        },
      ],
      rebuilt_paid_order: {
        payment_transaction_id: push.paymentTransactionId,
        surplus: push.surplus,
      },
    },
  });
}
