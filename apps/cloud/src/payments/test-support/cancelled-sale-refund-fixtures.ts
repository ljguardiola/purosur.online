import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { insertEnrolledInstallation } from "../../register/test-support/enrolled-installation.js";
import { applyCancelledSale } from "../../sales/test-support/applied-sales.js";
import { aTransferCancelledSale } from "../../sync/test-support/synced-facts.js";

export async function aPendingRefundOfCancelledSale<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  { cancelledAt, registerName = "Caja 1" }: { cancelledAt: Date; registerName?: string },
) {
  const { deviceId, locationId } = await insertEnrolledInstallation(db, {
    now: cancelledAt,
    registerName,
  });
  const cancelled = await applyCancelledSale(db, {
    deviceId,
    cancelledAt,
    total: 2_000,
    overrides: aTransferCancelledSale({ cancelledAt }),
  });
  const [refund] = cancelled.refunds;
  if (!refund) {
    throw new Error("test setup: the cancelled sale has no refund");
  }
  return {
    refundId: refund.id,
    saleId: cancelled.id,
    locationId,
    method: refund.method,
    amount: refund.amount,
    openedAt: cancelledAt,
  };
}
