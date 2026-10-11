import type {
  EndedMercadoPagoQrChargeState,
  MercadoPagoQrCharges,
  PendingMercadoPagoQrCharge,
} from "@purosur/domain/payments/use-cases";
import type { LocalDatabase } from "../platform/local-database";

interface PendingChargeRow {
  id: string;
  sale_id: string;
  amount: number;
  wait_ends_at: string;
}

export class SqliteMercadoPagoQrCharges implements MercadoPagoQrCharges {
  private readonly database: LocalDatabase;

  constructor(database: LocalDatabase) {
    this.database = database;
  }

  pendingCharge(paymentTransactionId: string): PendingMercadoPagoQrCharge | null {
    const row = this.database
      .prepare<[string], PendingChargeRow>(
        `SELECT id, sale_id, amount, wait_ends_at FROM payment_transactions
         WHERE id = ? AND method = 'QR' AND state = 'PENDING' AND replaced = 0`,
      )
      .get(paymentTransactionId);
    if (row === undefined) {
      return null;
    }
    return {
      paymentTransactionId: row.id,
      saleId: row.sale_id,
      amount: row.amount,
      waitEndsAt: new Date(row.wait_ends_at),
    };
  }

  recordEnded(paymentTransactionId: string, state: EndedMercadoPagoQrChargeState): void {
    this.database
      .prepare(
        "UPDATE payment_transactions SET state = ? WHERE id = ? AND method = 'QR' AND state = 'PENDING'",
      )
      .run(state, paymentTransactionId);
  }

  endWait(paymentTransactionId: string, endedAt: Date): void {
    this.database
      .prepare(
        "UPDATE payment_transactions SET wait_ends_at = ? WHERE id = ? AND method = 'QR' AND state = 'PENDING'",
      )
      .run(endedAt.toISOString(), paymentTransactionId);
  }
}
