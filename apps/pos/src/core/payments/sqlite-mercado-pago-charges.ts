import type {
  EndedMercadoPagoChargeState,
  InterruptedMercadoPagoCharge,
  MercadoPagoCharges,
  PendingMercadoPagoCharge,
} from "@purosur/domain/payments/use-cases";
import type { LocalDatabase } from "../platform/local-database";

const PENDING_MERCADO_PAGO_CHARGE =
  "payment_transactions.method IN ('QR', 'POINT') AND payment_transactions.state = 'PENDING' AND payment_transactions.replaced = 0";

interface PendingChargeRow {
  id: string;
  sale_id: string;
  method: PendingMercadoPagoCharge["method"];
  amount: number;
  wait_ends_at: string;
}

export class SqliteMercadoPagoCharges implements MercadoPagoCharges {
  private readonly database: LocalDatabase;

  constructor(database: LocalDatabase) {
    this.database = database;
  }

  pendingCharge(paymentTransactionId: string): PendingMercadoPagoCharge | null {
    const row = this.database
      .prepare<[string], PendingChargeRow>(
        `SELECT id, sale_id, method, amount, wait_ends_at FROM payment_transactions
         WHERE id = ? AND ${PENDING_MERCADO_PAGO_CHARGE}`,
      )
      .get(paymentTransactionId);
    if (row === undefined) {
      return null;
    }
    return {
      paymentTransactionId: row.id,
      saleId: row.sale_id,
      method: row.method,
      amount: row.amount,
      waitEndsAt: new Date(row.wait_ends_at),
    };
  }

  pendingChargesRecordedBefore(moment: Date): InterruptedMercadoPagoCharge[] {
    return this.database
      .prepare<[string], { id: string; actor_id: string }>(
        `SELECT payment_transactions.id, sales.actor_id FROM payment_transactions
         JOIN sales ON sales.id = payment_transactions.sale_id
         WHERE ${PENDING_MERCADO_PAGO_CHARGE} AND payment_transactions.occurred_at < ?
         ORDER BY payment_transactions.occurred_at, payment_transactions.rowid`,
      )
      .all(moment.toISOString())
      .map(({ id, actor_id }) => ({ paymentTransactionId: id, actorId: actor_id }));
  }

  recordEnded(paymentTransactionId: string, state: EndedMercadoPagoChargeState): void {
    this.database
      .prepare(
        "UPDATE payment_transactions SET state = ? WHERE id = ? AND method IN ('QR', 'POINT') AND state = 'PENDING'",
      )
      .run(state, paymentTransactionId);
  }

  recordWaitEnd(paymentTransactionId: string, waitEndsAt: Date): void {
    this.database
      .prepare(
        "UPDATE payment_transactions SET wait_ends_at = ? WHERE id = ? AND method IN ('QR', 'POINT') AND state = 'PENDING'",
      )
      .run(waitEndsAt.toISOString(), paymentTransactionId);
  }
}
