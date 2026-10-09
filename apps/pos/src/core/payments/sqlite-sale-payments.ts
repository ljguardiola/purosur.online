import type { PaymentTransaction } from "@purosur/domain";
import type { LocalDatabase } from "../platform/local-database";

interface PaymentRow {
  id: string;
  sale_id: string;
  kind: PaymentTransaction["kind"];
  method: PaymentTransaction["method"];
  provider: PaymentTransaction["provider"];
  amount: number;
  tendered: number | null;
  authorized_by: string | null;
  confirmed_at: string | null;
  state: PaymentTransaction["state"];
  occurred_at: string;
}

export function readSalePayments(database: LocalDatabase, saleId: string): PaymentTransaction[] {
  return database
    .prepare<[string], PaymentRow>(
      `SELECT id, sale_id, kind, method, provider, amount, tendered, authorized_by, confirmed_at, state,
              occurred_at
       FROM payment_transactions WHERE sale_id = ? AND state = 'APPROVED' ORDER BY rowid`,
    )
    .all(saleId)
    .map(toPayment);
}

function toPayment(row: PaymentRow): PaymentTransaction {
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
