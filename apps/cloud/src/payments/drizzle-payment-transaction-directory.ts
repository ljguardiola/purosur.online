import { PENDING_PAYMENT_TRANSACTION_STATE } from "@purosur/domain";
import type {
  PaymentTransactionDirectory,
  PaymentTransactionReference,
} from "@purosur/domain/payments/use-cases";
import { eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { paymentTransactions } from "../platform/db/schema.js";

export class DrizzlePaymentTransactionDirectory<TQueryResult extends PgQueryResultHKT>
  implements PaymentTransactionDirectory
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async paymentTransactionOfOrder(
    providerOrderId: string,
  ): Promise<PaymentTransactionReference | null> {
    const [row] = await this.db
      .select({ id: paymentTransactions.id, registerId: paymentTransactions.registerId })
      .from(paymentTransactions)
      .where(sql`lower(${paymentTransactions.providerOrderId}) = ${providerOrderId.toLowerCase()}`);
    return row ?? null;
  }

  async pendingPaymentTransactions(): Promise<PaymentTransactionReference[]> {
    return this.db
      .select({ id: paymentTransactions.id, registerId: paymentTransactions.registerId })
      .from(paymentTransactions)
      .where(eq(paymentTransactions.state, PENDING_PAYMENT_TRANSACTION_STATE));
  }
}
