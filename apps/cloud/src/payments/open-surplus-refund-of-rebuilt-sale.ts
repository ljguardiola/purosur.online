import { latePaymentRefund, type MercadoPagoPaymentMethod } from "@purosur/domain";
import type { LatePaymentRefundOpening } from "@purosur/domain/payments/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { paymentTransactions } from "../platform/db/schema.js";
import { openLatePaymentRefund } from "./open-late-payment-refund.js";

export async function openSurplusRefundOfRebuiltSale<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  surplus: { paymentTransactionId: string; amount: number },
  openedAt: Date,
): Promise<LatePaymentRefundOpening> {
  const [transaction] = await tx
    .select({ method: paymentTransactions.method, provider: paymentTransactions.provider })
    .from(paymentTransactions)
    .where(eq(paymentTransactions.id, surplus.paymentTransactionId));
  if (!transaction) {
    throw new Error(`payment transaction ${surplus.paymentTransactionId} is not recorded`);
  }
  return openLatePaymentRefund(
    tx,
    latePaymentRefund({
      id: surplus.paymentTransactionId,
      method: transaction.method as MercadoPagoPaymentMethod,
      provider: transaction.provider,
      amount: surplus.amount,
    }),
    openedAt,
  );
}
