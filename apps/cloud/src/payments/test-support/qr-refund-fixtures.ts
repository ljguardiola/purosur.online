import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { paymentRefunds, paymentTransactions } from "../../platform/db/schema.js";
import { insertEnrolledInstallation } from "../../register/test-support/enrolled-installation.js";
import { applyCancelledSale } from "../../sales/test-support/applied-sales.js";
import { insertInboxEvent } from "../../sync/test-support/inbox-events.js";
import { ORDER_ID } from "./fake-mercado-pago-orders.js";
import { pendingPointTransaction, pendingTransaction } from "./payment-transaction-fixtures.js";

export interface PendingQrRefund {
  refundId: string;
  saleId: string;
  deviceId: string;
  registerId: string;
  locationId: string;
  transactionId: string;
  originEventId: string;
  amount: number;
}

interface PendingRefundOptions {
  cancelledAt: Date;
  amount?: number;
  orderId?: string | null;
  cancellingEvent?: boolean;
  registerName?: string;
}

export function aPendingQrRefundOfCancelledSale<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  options: PendingRefundOptions,
): Promise<PendingQrRefund> {
  return aPendingMercadoPagoRefundOfCancelledSale(db, "QR", options);
}

export function aPendingPointRefundOfCancelledSale<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  options: PendingRefundOptions,
): Promise<PendingQrRefund> {
  return aPendingMercadoPagoRefundOfCancelledSale(db, "POINT", options);
}

async function aPendingMercadoPagoRefundOfCancelledSale<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  method: "QR" | "POINT",
  {
    cancelledAt,
    amount = 2_450,
    orderId = ORDER_ID,
    cancellingEvent = true,
    registerName = "Caja 1",
  }: PendingRefundOptions,
): Promise<PendingQrRefund> {
  const { deviceId, locationId, registerId } = await insertEnrolledInstallation(db, {
    now: cancelledAt,
    registerName,
  });
  const backing = { state: "APPROVED", amount, providerOrderId: orderId } as const;
  const transaction =
    method === "QR"
      ? pendingTransaction(registerId, backing)
      : pendingPointTransaction(registerId, backing);
  await db.insert(paymentTransactions).values(transaction);
  const payment = {
    id: transaction.id,
    method,
    provider: transaction.provider,
    amount,
    tendered: null,
    state: "APPROVED" as const,
    occurredAt: transaction.createdAt,
    authorizedBy: null,
    confirmedAt: null,
  };
  const cancelled = await applyCancelledSale(db, {
    deviceId,
    cancelledAt,
    total: amount,
    overrides: {
      id: transaction.saleId,
      payments: [payment],
      refunds: [
        {
          id: crypto.randomUUID(),
          paymentId: payment.id,
          method,
          provider: transaction.provider,
          amount,
          state: "PENDING",
          occurredAt: cancelledAt,
        },
      ],
      cashMovements: [],
    },
  });
  const [refund] = cancelled.refunds;
  if (!refund) {
    throw new Error("test setup: the cancelled sale has no refund");
  }
  const [stored] = await db
    .select({ originEventId: paymentRefunds.originEventId })
    .from(paymentRefunds)
    .where(eq(paymentRefunds.id, refund.id));
  const originEventId = stored?.originEventId;
  if (!originEventId) {
    throw new Error("test setup: the refund names no origin event");
  }
  if (cancellingEvent) {
    await insertInboxEvent(db, deviceId, {
      eventId: originEventId,
      aggregateType: "Sale",
      aggregateId: cancelled.id,
      eventType: "sale_cancelled",
      schemaVersion: method === "QR" ? 6 : 7,
      appliedAt: cancelledAt,
    });
  }
  return {
    refundId: refund.id,
    saleId: cancelled.id,
    deviceId,
    registerId,
    locationId,
    transactionId: transaction.id,
    originEventId,
    amount,
  };
}
