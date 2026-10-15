import { randomUUID } from "node:crypto";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { insertEnrolledInstallation } from "../../register/test-support/enrolled-installation.js";
import { applyVoidedSale } from "../../sales/test-support/applied-sales.js";
import { aCompletedSale } from "../../sync/test-support/synced-facts.js";

export async function aPendingRefundOfVoidedSale<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  { voidedAt, registerName = `Caja ${randomUUID()}` }: { voidedAt: Date; registerName?: string },
) {
  const completedAt = new Date(voidedAt.getTime() - 20 * 60 * 1000);
  const { deviceId, locationId } = await insertEnrolledInstallation(db, {
    now: voidedAt,
    registerName,
  });
  const [cash] = aCompletedSale().payments;
  if (!cash) {
    throw new Error("test setup: the sale has no payment");
  }
  const voided = await applyVoidedSale(db, {
    deviceId,
    completedAt,
    voidedAt,
    completed: {
      total: 2_000,
      payments: [
        {
          ...cash,
          method: "TRANSFER",
          amount: 2_000,
          tendered: null,
          authorizedBy: "4a7c1e9d-3b62-4f05-8d1a-6e2b9c5f3a13",
          confirmedAt: completedAt,
        },
      ],
    },
  });
  const [refund] = voided.refunds;
  if (!refund) {
    throw new Error("test setup: the voided sale has no refund");
  }
  return {
    refundId: refund.id,
    saleId: voided.id,
    locationId,
    method: refund.method,
    amount: refund.amount,
    openedAt: voidedAt,
    completedAt,
  };
}
