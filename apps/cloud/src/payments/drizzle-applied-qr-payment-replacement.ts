import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { paymentTransactions } from "../platform/db/schema.js";
import type { AppliedOrigin } from "../register/drizzle-applied-cash-sessions.js";

export async function recordAppliedQrPaymentReplacement<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  { registerId }: AppliedOrigin,
  { replacement }: Extract<SyncedFact, { kind: "qr_payment_replaced" }>,
): Promise<void> {
  const updated = await tx
    .update(paymentTransactions)
    .set({ replaced: true })
    .where(
      and(
        eq(paymentTransactions.id, replacement.paymentTransactionId),
        eq(paymentTransactions.registerId, registerId),
        eq(paymentTransactions.saleId, replacement.saleId),
      ),
    )
    .returning({ id: paymentTransactions.id });
  if (updated.length === 0) {
    throw new Error(
      `payment transaction ${replacement.paymentTransactionId} is not recorded for register ${registerId} and sale ${replacement.saleId}`,
    );
  }
}
