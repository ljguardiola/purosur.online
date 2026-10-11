import { isLateApproval, latePaymentRefund, type PaymentTransactionState } from "@purosur/domain";
import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { paymentTransactions } from "../platform/db/schema.js";
import type { AppliedOrigin } from "../register/drizzle-applied-cash-sessions.js";
import { openLatePaymentRefund } from "./open-late-payment-refund.js";

export async function recordAppliedQrPaymentReplacement<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  { registerId }: AppliedOrigin,
  { replacement }: Extract<SyncedFact, { kind: "qr_payment_replaced" }>,
  appliedAt: Date,
): Promise<void> {
  const [transaction] = await tx
    .update(paymentTransactions)
    .set({ replaced: true })
    .where(
      and(
        eq(paymentTransactions.id, replacement.paymentTransactionId),
        eq(paymentTransactions.registerId, registerId),
        eq(paymentTransactions.saleId, replacement.saleId),
      ),
    )
    .returning({
      id: paymentTransactions.id,
      state: paymentTransactions.state,
      amount: paymentTransactions.amount,
    });
  if (!transaction) {
    throw new Error(
      `payment transaction ${replacement.paymentTransactionId} is not recorded for register ${registerId} and sale ${replacement.saleId}`,
    );
  }
  if (isLateApproval({ state: transaction.state as PaymentTransactionState, replaced: true })) {
    await openLatePaymentRefund(
      tx,
      latePaymentRefund({
        id: transaction.id,
        method: "QR",
        provider: "MERCADOPAGO_QR",
        amount: transaction.amount,
      }),
      appliedAt,
    );
  }
}
