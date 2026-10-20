import type { LocalDatabase } from "../../platform/local-database";

const SOLD_AT = "2026-09-30T15:05:00.000Z";
export const VOIDED_AT = "2026-09-30T15:40:00.000Z";
export const ISSUED_AT = "2026-09-30T15:40:01.000Z";
export const ANSWERED_AT = "2026-09-30T15:52:05.000Z";

export function insertVoidedSale(database: LocalDatabase): void {
  database.exec(
    `INSERT INTO roles (id, name, is_administrator, version) VALUES ('cashier', 'Cajera', 0, 1);
     INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES ('u1', 'Ada', 'cashier', 's', 1, 1);
     INSERT INTO branch_settings (location_id, address, whatsapp_number, instagram_handle, weekly_hours, expiring_lot_alert_days, unreviewed_price_alert_days, good_condition_return_days, version)
     VALUES ('location-1', 'Av. Belgrano 1450', '11 5555-0100', '@puro.sur', '{}', 30, 30, 15, 1);
     INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
     VALUES ('s1', 'r1', 'device-1', 'u1', '2026-09-30T12:00:00.000Z', 0, 'OPEN');
     INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at, operation_number, voided_at)
     VALUES ('sale-1', 'r1', 'device-1', 's1', 'u1', 'VOIDED', '${SOLD_AT}', 482, '${VOIDED_AT}');
     INSERT INTO products (id, name, category_id, sale_unit, active, version)
     VALUES ('p1', 'Alfajor del catalogo', 'c', 'UNIT', 1, 1), ('p2', 'Yerba del catalogo', 'c', 'UNIT', 1, 1);
     INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, sale_unit, quantity, list_unit_price, price_list_id, discount_amount, line_total)
     VALUES ('line-1', 'sale-1', 1, 'p1', 'Alfajor', 'UNIT', 2, 420000, 'list-1', 0, 840000),
            ('line-2', 'sale-1', 2, 'p2', 'Yerba', 'UNIT', 1, 350000, 'list-1', 0, 350000);
     INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, tendered, authorized_by, confirmed_at, state, occurred_at)
     VALUES ('pay-1', 'sale-1', 'SALE', 'CASH', 'NONE', 700000, 800000, NULL, NULL, 'APPROVED', '${SOLD_AT}'),
            ('pay-2', 'sale-1', 'SALE', 'TRANSFER', 'NONE', 490000, NULL, 'u1', '${SOLD_AT}', 'APPROVED', '${SOLD_AT}');
     INSERT INTO payment_refunds (id, payment_id, method, provider, amount, state, occurred_at)
     VALUES ('refund-1', 'pay-1', 'CASH', 'NONE', 700000, 'APPROVED', '${VOIDED_AT}'),
            ('refund-2', 'pay-2', 'TRANSFER', 'NONE', 490000, 'PENDING', '${VOIDED_AT}');`,
  );
}

export function insertCreditNote(
  database: LocalDatabase,
  answer: Partial<{
    state: string;
    point_of_sale: number | null;
    number: number | null;
    issued_on: string | null;
    issued_at: string | null;
    authorization_code: string | null;
    authorization_code_due_on: string | null;
    answered_at: string | null;
  }> = {},
  corrects = { pointOfSale: 12, number: 41 },
): void {
  database
    .prepare(
      `INSERT INTO sale_void_credit_notes (
         id, sale_id, total, receiver_tax_status_code, corrected_voucher_type,
         corrected_point_of_sale, corrected_number, state, point_of_sale, number, issued_on,
         issued_at, authorization_code, authorization_code_due_on, recorded_at, answered_at
       ) VALUES (
         'note-1', 'sale-1', 1190000, 5, 11, @corrected_point_of_sale, @corrected_number,
         @state, @point_of_sale, @number, @issued_on, @issued_at, @authorization_code,
         @authorization_code_due_on, '${VOIDED_AT}', @answered_at
       )`,
    )
    .run({
      corrected_point_of_sale: corrects.pointOfSale,
      corrected_number: corrects.number,
      state: "AUTHORIZED",
      point_of_sale: 12,
      number: 7,
      issued_on: "2026-09-30",
      issued_at: ISSUED_AT,
      authorization_code: "71234567890999",
      authorization_code_due_on: "2026-10-10",
      answered_at: ANSWERED_AT,
      ...answer,
    });
}
