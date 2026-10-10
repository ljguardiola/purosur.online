import type { PendingQrSalePayment, SalePayment } from "@purosur/domain";
import type { LocalDatabase } from "../platform/local-database";

interface PaymentRow {
  id: string;
  sale_id: string;
  kind: SalePayment["kind"];
  method: SalePayment["method"];
  provider: SalePayment["provider"];
  amount: number;
  tendered: number | null;
  authorized_by: string | null;
  confirmed_at: string | null;
  state: SalePayment["state"];
  occurred_at: string;
}

export function readSalePayments(database: LocalDatabase, saleId: string): SalePayment[] {
  return database
    .prepare<[string], PaymentRow>(
      `SELECT id, sale_id, kind, method, provider, amount, tendered, authorized_by, confirmed_at, state,
              occurred_at
       FROM payment_transactions WHERE sale_id = ? AND state = 'APPROVED' ORDER BY rowid`,
    )
    .all(saleId)
    .map(toPayment);
}

function toPayment(row: PaymentRow): SalePayment {
  const common = {
    id: row.id,
    saleId: row.sale_id,
    kind: row.kind,
    amount: row.amount,
    state: row.state,
    occurredAt: new Date(row.occurred_at),
  };
  if (row.method === "QR") {
    return { ...common, method: "QR", provider: "MERCADOPAGO_QR" };
  }
  if (row.method === "TRANSFER") {
    return {
      ...common,
      method: "TRANSFER",
      provider: "NONE",
      authorizedBy: row.authorized_by as string,
      confirmedAt: new Date(row.confirmed_at as string),
    };
  }
  return {
    ...common,
    method: "CASH",
    provider: "NONE",
    ...(row.tendered === null ? {} : { tendered: row.tendered }),
  };
}

interface PendingQrPaymentRow {
  id: string;
  sale_id: string;
  amount: number;
  occurred_at: string;
  wait_ends_at: string;
}

const PENDING_QR_PAYMENTS = `SELECT id, sale_id, amount, occurred_at, wait_ends_at FROM payment_transactions
  WHERE method = 'QR' AND state = 'PENDING'`;

function toPendingQrPayment(row: PendingQrPaymentRow): PendingQrSalePayment {
  return {
    id: row.id,
    saleId: row.sale_id,
    amount: row.amount,
    occurredAt: new Date(row.occurred_at),
    waitEndsAt: new Date(row.wait_ends_at),
  };
}

export function insertPendingQrPayment(
  database: LocalDatabase,
  payment: PendingQrSalePayment,
): void {
  database
    .prepare(
      `INSERT INTO payment_transactions (
         id, sale_id, kind, method, provider, amount, state, occurred_at, wait_ends_at
       ) VALUES (
         @id, @sale_id, 'SALE', 'QR', 'MERCADOPAGO_QR', @amount, 'PENDING', @occurred_at, @wait_ends_at
       )`,
    )
    .run({
      id: payment.id,
      sale_id: payment.saleId,
      amount: payment.amount,
      occurred_at: payment.occurredAt.toISOString(),
      wait_ends_at: payment.waitEndsAt.toISOString(),
    });
}

export function readPendingQrPayment(
  database: LocalDatabase,
  paymentTransactionId: string,
): PendingQrSalePayment | undefined {
  const row = database
    .prepare<[string], PendingQrPaymentRow>(`${PENDING_QR_PAYMENTS} AND id = ?`)
    .get(paymentTransactionId);
  return row === undefined ? undefined : toPendingQrPayment(row);
}

export function readPendingQrPaymentsOf(
  database: LocalDatabase,
  saleId: string,
): PendingQrSalePayment[] {
  return database
    .prepare<[string], PendingQrPaymentRow>(`${PENDING_QR_PAYMENTS} AND sale_id = ? ORDER BY rowid`)
    .all(saleId)
    .map(toPendingQrPayment);
}

export function approvePendingQrPayment(
  database: LocalDatabase,
  paymentTransactionId: string,
): void {
  database
    .prepare(
      "UPDATE payment_transactions SET state = 'APPROVED' WHERE id = ? AND method = 'QR' AND state = 'PENDING'",
    )
    .run(paymentTransactionId);
}
