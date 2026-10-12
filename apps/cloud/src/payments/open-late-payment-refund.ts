import { randomUUID } from "node:crypto";
import type { LatePaymentRefund } from "@purosur/domain";
import type { LatePaymentRefundOpening } from "@purosur/domain/payments/use-cases";
import { eq, isNotNull, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { openAlert } from "../alerts/open-alert.js";
import { paymentRefunds, paymentTransactions, registers } from "../platform/db/schema.js";

export async function openLatePaymentRefund<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  refund: LatePaymentRefund,
  openedAt: Date,
): Promise<LatePaymentRefundOpening> {
  const [payment] = await tx
    .select({ saleId: paymentTransactions.saleId, locationId: registers.locationId })
    .from(paymentTransactions)
    .innerJoin(registers, eq(registers.id, paymentTransactions.registerId))
    .where(eq(paymentTransactions.id, refund.paymentId));
  if (!payment) {
    throw new Error(`payment transaction ${refund.paymentId} is not recorded`);
  }
  const insertion = tx.insert(paymentRefunds).values({
    id: randomUUID(),
    saleId: payment.saleId,
    paymentTransactionId: refund.paymentId,
    providerOrderId: refund.providerOrderId,
    origin: refund.origin,
    method: refund.method,
    provider: refund.provider,
    amount: refund.amount,
    state: refund.state,
    occurredAt: openedAt,
  });
  const [opened] = await (refund.providerOrderId === null
    ? insertion.onConflictDoNothing({
        target: paymentRefunds.paymentTransactionId,
        where: isNull(paymentRefunds.providerOrderId),
      })
    : insertion.onConflictDoNothing({
        target: [paymentRefunds.paymentTransactionId, paymentRefunds.providerOrderId],
        where: isNotNull(paymentRefunds.providerOrderId),
      })
  ).returning({ id: paymentRefunds.id });
  if (!opened) {
    return "already_open";
  }
  await openAlert(
    tx,
    {
      kind: "late_payment_refund",
      scope: opened.id,
      locationId: payment.locationId,
      detail: {
        saleId: payment.saleId,
        amount: refund.amount,
        providerOrderId: refund.providerOrderId,
      },
    },
    { now: () => openedAt },
  );
  return "opened";
}
