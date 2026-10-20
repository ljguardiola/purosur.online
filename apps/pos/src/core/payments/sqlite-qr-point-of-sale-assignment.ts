import type { LocalDatabase } from "../platform/local-database";

export function qrPointOfSaleAssigned(database: LocalDatabase): boolean {
  const row = database
    .prepare<[], { assigned: number }>(
      `SELECT register_qr_point_of_sale.assigned AS assigned
       FROM register_qr_point_of_sale
       JOIN own_register ON own_register.id = register_qr_point_of_sale.register_id
       WHERE own_register.removed = 0`,
    )
    .get();
  return row?.assigned === 1;
}
