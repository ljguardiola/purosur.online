import type { PaymentMethod, PaymentTransactionState } from "@purosur/domain";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { alerts, paymentRefunds, paymentTransactions } from "../../platform/db/schema.js";
import { insertEnrolledInstallation } from "../../register/test-support/enrolled-installation.js";
import { applyCompletedSale } from "../../sales/test-support/applied-sales.js";
import { pendingPointTransaction, pendingTransaction } from "./payment-transaction-fixtures.js";

export async function aPendingLatePaymentRefund<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  {
    openedAt,
    registerName = "Caja 1",
    coveredBy = [],
    providerOrderId = null,
    method = "QR",
    orderId = null,
    amount,
    refundAmount,
    transactionState = "APPROVED",
    heldBySale = false,
    saleCompletedAt,
  }: {
    openedAt: Date;
    registerName?: string;
    coveredBy?: PaymentMethod[];
    providerOrderId?: string | null;
    method?: "QR" | "POINT";
    orderId?: string | null;
    amount?: number;
    refundAmount?: number;
    transactionState?: PaymentTransactionState;
    heldBySale?: boolean;
    saleCompletedAt?: Date;
  },
) {
  const { deviceId, locationId, registerId } = await insertEnrolledInstallation(db, {
    now: openedAt,
    registerName,
  });
  const overrides = {
    state: transactionState,
    replaced: true,
    providerOrderId: orderId,
    ...(amount === undefined ? {} : { amount }),
  };
  const transaction =
    method === "POINT"
      ? pendingPointTransaction(registerId, overrides)
      : pendingTransaction(registerId, overrides);
  await db.insert(paymentTransactions).values(transaction);
  if (coveredBy.length > 0 || heldBySale) {
    await applyCompletedSale(db, {
      deviceId,
      completedAt: saleCompletedAt ?? transaction.createdAt,
      total: 5000,
      overrides: {
        id: transaction.saleId,
        payments: [
          ...(heldBySale
            ? [
                {
                  id: transaction.id,
                  method: transaction.method,
                  provider: transaction.provider,
                  cardType: null,
                  amount: transaction.amount,
                  tendered: null,
                  state: "APPROVED" as const,
                  occurredAt: transaction.createdAt,
                  authorizedBy: null,
                  confirmedAt: null,
                },
              ]
            : []),
          ...coveredBy.map((method) => ({
            id: crypto.randomUUID(),
            method,
            provider: "NONE" as const,
            cardType: null,
            amount: 1000,
            tendered: null,
            state: "APPROVED" as const,
            occurredAt: transaction.createdAt,
            authorizedBy: null,
            confirmedAt: null,
          })),
        ],
      },
    });
  }
  const refundId = crypto.randomUUID();
  await db.insert(paymentRefunds).values({
    id: refundId,
    saleId: transaction.saleId,
    paymentTransactionId: transaction.id,
    origin: "late_payment",
    providerOrderId,
    method: transaction.method,
    provider: transaction.provider,
    amount: refundAmount ?? transaction.amount,
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
      detail: {
        saleId: transaction.saleId,
        amount: refundAmount ?? transaction.amount,
        providerOrderId,
        method: transaction.method,
      },
      openedAt,
    })
    .returning({ id: alerts.id });
  if (!alert) {
    throw new Error("test setup: opening the alert returned no row");
  }
  return {
    refundId,
    saleId: transaction.saleId,
    amount: refundAmount ?? transaction.amount,
    transactionId: transaction.id,
    saleOccurredAt: transaction.createdAt,
    locationId,
    registerId,
    alertId: alert.id,
  };
}
