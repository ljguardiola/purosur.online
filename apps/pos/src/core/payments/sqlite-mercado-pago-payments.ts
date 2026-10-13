import { MERCADO_PAGO_PAYMENT_METHODS, type PaymentTransactionState } from "@purosur/domain";
import type {
  MercadoPagoPaymentSummary,
  MercadoPagoPayments,
} from "@purosur/domain/payments/use-cases";
import type { LocalDatabase } from "../platform/local-database";

const METHOD_PLACEHOLDERS = MERCADO_PAGO_PAYMENT_METHODS.map(() => "?").join(", ");

export class SqliteMercadoPagoPayments implements MercadoPagoPayments {
  private readonly database: LocalDatabase;

  constructor(database: LocalDatabase) {
    this.database = database;
  }

  unreplacedPaymentsIn(state: PaymentTransactionState): MercadoPagoPaymentSummary[] {
    return this.database
      .prepare<
        string[],
        {
          id: string;
          sale_id: string;
          method: MercadoPagoPaymentSummary["method"];
          amount: number;
          occurred_at: string;
        }
      >(
        `SELECT id, sale_id, method, amount, occurred_at FROM payment_transactions
         WHERE method IN (${METHOD_PLACEHOLDERS}) AND state = ? AND replaced = 0
         ORDER BY occurred_at, rowid`,
      )
      .all(...MERCADO_PAGO_PAYMENT_METHODS, state)
      .map((row) => ({
        paymentId: row.id,
        saleId: row.sale_id,
        method: row.method,
        amount: row.amount,
        occurredAt: new Date(row.occurred_at),
      }));
  }
}
