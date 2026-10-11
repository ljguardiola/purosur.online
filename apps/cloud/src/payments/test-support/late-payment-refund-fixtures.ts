import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { alerts, paymentRefunds, paymentTransactions } from "../../platform/db/schema.js";
import { insertEnrolledInstallation } from "../../register/test-support/enrolled-installation.js";
import { pendingTransaction } from "./payment-transaction-fixtures.js";

export async function aPendingLatePaymentRefund<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  { openedAt, registerName = "Caja 1" }: { openedAt: Date; registerName?: string },
) {
  const { locationId, registerId } = await insertEnrolledInstallation(db, {
    now: openedAt,
    registerName,
  });
  const transaction = pendingTransaction(registerId, { state: "APPROVED", replaced: true });
  await db.insert(paymentTransactions).values(transaction);
  const refundId = crypto.randomUUID();
  await db.insert(paymentRefunds).values({
    id: refundId,
    saleId: transaction.saleId,
    paymentTransactionId: transaction.id,
    origin: "late_payment",
    method: transaction.method,
    provider: transaction.provider,
    amount: transaction.amount,
    state: "PENDING",
    occurredAt: openedAt,
  });
  const [alert] = await db
    .insert(alerts)
    .values({
      kind: "late_payment_refund",
      scope: refundId,
      level: "warning",
      audience: "local",
      locationId,
      detail: { saleId: transaction.saleId, amount: transaction.amount },
      openedAt,
    })
    .returning({ id: alerts.id });
  if (!alert) {
    throw new Error("test setup: opening the alert returned no row");
  }
  return {
    refundId,
    saleId: transaction.saleId,
    amount: transaction.amount,
    locationId,
    registerId,
    alertId: alert.id,
  };
}
