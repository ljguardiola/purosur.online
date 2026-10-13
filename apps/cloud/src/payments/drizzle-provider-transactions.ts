import type { MercadoPagoOrderTransaction, PaymentTransactionState } from "@purosur/domain";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { paymentTransactions } from "../platform/db/schema.js";

export async function providerTransactionOfPayment<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  paymentId: string,
): Promise<Pick<MercadoPagoOrderTransaction, "saleId" | "amount" | "state" | "method"> | null> {
  const [row] = await db
    .select({
      saleId: paymentTransactions.saleId,
      amount: paymentTransactions.amount,
      state: paymentTransactions.state,
      method: paymentTransactions.method,
    })
    .from(paymentTransactions)
    .where(eq(paymentTransactions.id, paymentId));
  return row
    ? {
        ...row,
        state: row.state as PaymentTransactionState,
        method: row.method as MercadoPagoOrderTransaction["method"],
      }
    : null;
}
