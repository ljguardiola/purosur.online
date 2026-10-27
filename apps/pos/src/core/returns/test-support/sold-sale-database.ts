import type { LocalDatabase } from "../../platform/local-database";
import { openOutboxDatabase } from "../../sync/test-support/sqlite-local-outbox";

export const SOLD_AT = "2026-09-12T18:30:00.000Z";
export const SECOND_SESSION_OPENED_AT = "2026-09-20T12:00:00.000Z";

export function openSoldSaleDatabase(): LocalDatabase {
  const database = openOutboxDatabase();
  database.exec(
    `INSERT INTO own_register (id, name, version) VALUES ('register-1', 'Caja 1', 1);
     INSERT INTO roles (id, name, is_administrator, version) VALUES ('cashier', 'Cajera', 0, 1);
     INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES ('u1', 'Ada', 'cashier', 's', 1, 1);
     INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, closed_at, state)
     VALUES ('session-1', 'register-1', 'device-a', 'u1', '2026-09-12T12:00:00.000Z', 0, '2026-09-12T23:00:00.000Z', 'CLOSED');
     INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
     VALUES ('sale-1', 'register-1', 'device-a', 'session-1', 'u1', 'COMPLETED', '${SOLD_AT}');
     INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, discount_amount, line_total, promotion_id)
     VALUES ('line-1', 'sale-1', 1, 'yerba', 'Yerba 1 kg', 3, 2500, 'list-1', 0, 7500, NULL),
            ('line-2', 'sale-1', 2, 'galletitas', 'Galletitas', 4, 1500, 'list-1', 2000, 4000, 'two-for-one');
     INSERT INTO sale_line_promotions (line_id, discount_id, name, kind, percent, buy_qty, pay_qty)
     VALUES ('line-2', 'two-for-one', 'Dos por uno', 'BUY_N_PAY_M', NULL, 2, 1);
     INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, tendered, authorized_by, confirmed_at, state, occurred_at)
     VALUES ('pay-cash', 'sale-1', 'SALE', 'CASH', 'NONE', 6000, 6000, NULL, NULL, 'APPROVED', '${SOLD_AT}'),
            ('pay-transfer', 'sale-1', 'SALE', 'TRANSFER', 'NONE', 5500, NULL, 'u1', '${SOLD_AT}', 'APPROVED', '${SOLD_AT}');`,
  );
  return database;
}

export function openSecondSession(database: LocalDatabase): void {
  database
    .prepare(
      `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
       VALUES ('session-2', 'register-1', 'device-a', 'u1', ?, 0, 'OPEN')`,
    )
    .run(SECOND_SESSION_OPENED_AT);
}

export function insertBranchSettings(
  database: LocalDatabase,
  goodConditionReturnDays: number,
): void {
  database
    .prepare(
      `INSERT INTO branch_settings (location_id, address, whatsapp_number, instagram_handle, weekly_hours, expiring_lot_alert_days, unreviewed_price_alert_days, good_condition_return_days, version)
       VALUES ('location-1', 'Av. Belgrano 1450', '', '', '{}', 30, 30, ?, 1)`,
    )
    .run(goodConditionReturnDays);
}

export function insertStoredReturn(
  database: LocalDatabase,
  returnId: string,
  lines: { saleLineId: string; quantity: number; refundedAmount: number }[],
): void {
  database
    .prepare(
      `INSERT INTO returns (id, sale_id, register_id, device_id, session_id, actor_id, ticket_source, occurred_at)
       VALUES (?, 'sale-1', 'register-1', 'device-a', 'session-1', 'u1', 'QR', '2026-09-20T12:00:00.000Z')`,
    )
    .run(returnId);
  for (const line of lines) {
    database
      .prepare(
        `INSERT INTO return_lines (return_id, sale_line_id, quantity, reason, disposition, refunded_amount)
         VALUES (?, ?, ?, 'change_of_mind', 'restock', ?)`,
      )
      .run(returnId, line.saleLineId, line.quantity, line.refundedAmount);
  }
}

export function insertStoredRefund(
  database: LocalDatabase,
  refund: { id: string; paymentId: string; method: "CASH" | "TRANSFER"; amount: number },
): void {
  database
    .prepare(
      `INSERT INTO payment_refunds (id, payment_id, method, provider, amount, state, occurred_at)
       VALUES (?, ?, ?, 'NONE', ?, 'APPROVED', '2026-09-20T12:00:00.000Z')`,
    )
    .run(refund.id, refund.paymentId, refund.method, refund.amount);
}
