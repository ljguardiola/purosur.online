import type { MercadoPagoQrPaymentTransaction, PaymentTransactionState } from "@purosur/domain";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { paymentTransactions } from "../platform/db/schema.js";

export async function providerTransactionOfPayment<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  paymentId: string,
): Promise<Pick<MercadoPagoQrPaymentTransaction, "saleId" | "amount" | "state"> | null> {
  const [row] = await db
    .select({
      saleId: paymentTransactions.saleId,
      amount: paymentTransactions.amount,
      state: paymentTransactions.state,
    })
    .from(paymentTransactions)
    .where(eq(paymentTransactions.id, paymentId));
  return row ? { ...row, state: row.state as PaymentTransactionState } : null;
}
