import { randomUUID } from "node:crypto";
import type { LatePaymentRefund } from "@purosur/domain";
import type { LatePaymentRefundOpening } from "@purosur/domain/payments/use-cases";
import { eq } from "drizzle-orm";
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
  const [opened] = await tx
    .insert(paymentRefunds)
    .values({
      id: randomUUID(),
      saleId: payment.saleId,
      paymentTransactionId: refund.paymentId,
      origin: refund.origin,
      method: refund.method,
      provider: refund.provider,
      amount: refund.amount,
      state: refund.state,
      occurredAt: openedAt,
    })
    .onConflictDoNothing({ target: paymentRefunds.paymentTransactionId })
    .returning({ id: paymentRefunds.id });
  if (!opened) {
    return "already_open";
  }
  await openAlert(
    tx,
    {
      kind: "late_payment_refund",
      scope: opened.id,
      locationId: payment.locationId,
      detail: { saleId: payment.saleId, amount: refund.amount },
    },
    { now: () => openedAt },
  );
  return "opened";
}
