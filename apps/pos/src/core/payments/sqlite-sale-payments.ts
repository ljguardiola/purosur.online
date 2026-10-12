import type { PendingMercadoPagoSalePayment, SalePayment } from "@purosur/domain";
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
  if (row.method === "POINT") {
    return { ...common, method: "POINT", provider: "MERCADOPAGO_POINT" };
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

interface PendingMercadoPagoPaymentRow {
  id: string;
  sale_id: string;
  method: PendingMercadoPagoSalePayment["method"];
  amount: number;
  occurred_at: string;
  wait_ends_at: string;
}

const PENDING_MERCADO_PAGO_PAYMENTS = `SELECT id, sale_id, method, amount, occurred_at, wait_ends_at
  FROM payment_transactions WHERE method IN ('QR', 'POINT') AND state = 'PENDING'`;
const FOLLOWED_MERCADO_PAGO_PAYMENTS = `${PENDING_MERCADO_PAGO_PAYMENTS} AND replaced = 0`;

function toPendingMercadoPagoPayment(
  row: PendingMercadoPagoPaymentRow,
): PendingMercadoPagoSalePayment {
  const common = {
    id: row.id,
    saleId: row.sale_id,
    kind: "SALE",
    state: "PENDING",
    amount: row.amount,
    occurredAt: new Date(row.occurred_at),
    waitEndsAt: new Date(row.wait_ends_at),
  } as const;
  return row.method === "POINT"
    ? { ...common, method: "POINT", provider: "MERCADOPAGO_POINT" }
    : { ...common, method: "QR", provider: "MERCADOPAGO_QR" };
}

export function insertPendingMercadoPagoPayment(
  database: LocalDatabase,
  payment: PendingMercadoPagoSalePayment,
): void {
  database
    .prepare(
      `INSERT INTO payment_transactions (
         id, sale_id, kind, method, provider, amount, state, occurred_at, wait_ends_at
       ) VALUES (
         @id, @sale_id, 'SALE', @method, @provider, @amount, 'PENDING', @occurred_at, @wait_ends_at
       )`,
    )
    .run({
      id: payment.id,
      sale_id: payment.saleId,
      method: payment.method,
      provider: payment.provider,
      amount: payment.amount,
      occurred_at: payment.occurredAt.toISOString(),
      wait_ends_at: payment.waitEndsAt.toISOString(),
    });
}

export function readPendingMercadoPagoPayment(
  database: LocalDatabase,
  paymentTransactionId: string,
): PendingMercadoPagoSalePayment | undefined {
  const row = database
    .prepare<[string], PendingMercadoPagoPaymentRow>(`${FOLLOWED_MERCADO_PAGO_PAYMENTS} AND id = ?`)
    .get(paymentTransactionId);
  return row === undefined ? undefined : toPendingMercadoPagoPayment(row);
}

export function readPendingMercadoPagoPaymentsOf(
  database: LocalDatabase,
  saleId: string,
): PendingMercadoPagoSalePayment[] {
  return database
    .prepare<[string], PendingMercadoPagoPaymentRow>(
      `${PENDING_MERCADO_PAGO_PAYMENTS} AND sale_id = ? ORDER BY rowid`,
    )
    .all(saleId)
    .map(toPendingMercadoPagoPayment);
}

export function approvePendingMercadoPagoPayment(
  database: LocalDatabase,
  paymentTransactionId: string,
): void {
  database
    .prepare(
      "UPDATE payment_transactions SET state = 'APPROVED' WHERE id = ? AND method IN ('QR', 'POINT') AND state = 'PENDING'",
    )
    .run(paymentTransactionId);
}

export function markQrPaymentReplaced(
  database: LocalDatabase,
  paymentTransactionId: string,
  waitEndsAt: Date,
): void {
  database
    .prepare(
      "UPDATE payment_transactions SET replaced = 1, wait_ends_at = ? WHERE id = ? AND method = 'QR' AND state = 'PENDING'",
    )
    .run(waitEndsAt.toISOString(), paymentTransactionId);
}
