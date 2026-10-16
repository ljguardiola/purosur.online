import { randomUUID } from "node:crypto";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { users } from "../../platform/db/schema.js";
import { insertInboxEvent } from "./inbox-events.js";

const CASHIER = "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03";
const OCCURRED_AT = "2026-10-06T11:20:00.000Z";

const PUSH_OF = {
  QR: { provider: "MERCADOPAGO_QR", schemaVersion: 6 },
  POINT: { provider: "MERCADOPAGO_POINT", schemaVersion: 7 },
} as const;

export async function pushMercadoPagoSaleCancelled<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  options: {
    deviceId: string;
    locationId: string;
    saleId: string;
    paymentId: string;
    amount: number;
    method: keyof typeof PUSH_OF;
  },
): Promise<string> {
  const { provider, schemaVersion } = PUSH_OF[options.method];
  const sessionId = randomUUID();
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
    payload: { opened_by: CASHIER, opened_at: OCCURRED_AT, opening_float: 10_000 },
  });
  return insertInboxEvent(db, options.deviceId, {
    aggregateId: options.saleId,
    eventType: "sale_cancelled",
    schemaVersion,
    payload: {
      id: options.saleId,
      register_id: randomUUID(),
      device_id: options.deviceId,
      session_id: sessionId,
      actor_id: CASHIER,
      authorized_by: null,
      occurred_at: OCCURRED_AT,
      total: options.amount,
      sale_discount: null,
      lines: [],
      cash_movements: [],
      payments: [
        {
          id: options.paymentId,
          kind: "SALE",
          method: options.method,
          provider,
          amount: options.amount,
          tendered: null,
          state: "APPROVED",
          occurred_at: OCCURRED_AT,
          authorized_by: null,
          confirmed_at: null,
        },
      ],
      refunds: [
        {
          id: randomUUID(),
          kind: "REFUND",
          parent_id: options.paymentId,
          method: options.method,
          provider,
          amount: options.amount,
          state: "PENDING",
          occurred_at: OCCURRED_AT,
        },
      ],
    },
  });
}
