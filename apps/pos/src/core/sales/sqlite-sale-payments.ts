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
  state: PaymentTransaction["state"];
  occurred_at: string;
}

export function readSalePayments(database: LocalDatabase, saleId: string): PaymentTransaction[] {
  return database
    .prepare<[string], PaymentRow>(
      `SELECT id, sale_id, kind, method, provider, amount, tendered, state, occurred_at
       FROM payment_transactions WHERE sale_id = ? ORDER BY rowid`,
    )
    .all(saleId)
    .map((row) => ({
      id: row.id,
      saleId: row.sale_id,
      kind: row.kind,
      method: row.method,
      provider: row.provider,
      amount: row.amount,
      ...(row.tendered === null ? {} : { tendered: row.tendered }),
      state: row.state,
      occurredAt: new Date(row.occurred_at),
    }));
}
