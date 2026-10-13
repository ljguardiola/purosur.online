import type { LocalDatabase } from "../platform/local-database";
import { PENDING_MERCADO_PAGO_CHARGE } from "./sqlite-mercado-pago-charges";

export interface PendingMercadoPagoPaymentSummary {
  paymentId: string;
  saleId: string;
  method: "QR" | "POINT";
  amount: number;
  occurredAt: Date;
}

export function readPendingMercadoPagoPayments(
  database: LocalDatabase,
): PendingMercadoPagoPaymentSummary[] {
  return database
    .prepare<
      [],
      {
        id: string;
        sale_id: string;
        method: "QR" | "POINT";
        amount: number;
        occurred_at: string;
      }
    >(
      `SELECT id, sale_id, method, amount, occurred_at FROM payment_transactions
       WHERE ${PENDING_MERCADO_PAGO_CHARGE}
       ORDER BY occurred_at, rowid`,
    )
    .all()
    .map((row) => ({
      paymentId: row.id,
      saleId: row.sale_id,
      method: row.method,
      amount: row.amount,
      occurredAt: new Date(row.occurred_at),
    }));
}
