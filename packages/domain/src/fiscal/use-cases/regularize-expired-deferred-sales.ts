import { argentinaCalendarDay, argentinaInstant } from "../../shared/index.js";
import { isDeferredSaleExpired } from "../model/deferred-sale-expiry.js";
import { deferredSaleRegularizationTask } from "../model/deferred-sale-record.js";
import type { RegularizeExpiredDeferredSalesPorts } from "./regularize-expired-deferred-sales-ports.js";

export type RegularizeExpiredDeferredSalesOutcome = { kind: "regularized"; count: number };

export async function regularizeExpiredDeferredSales({
  store,
  clock,
}: RegularizeExpiredDeferredSalesPorts): Promise<RegularizeExpiredDeferredSalesOutcome> {
  const now = clock.now();
  const startOfToday = new Date(argentinaInstant(argentinaCalendarDay(now), "00:00"));
  return store.transaction(async (transaction) => {
    const candidates = await transaction.lockPendingDeferredSalesOccurredBefore(startOfToday);
    const expired = candidates.filter((sale) => isDeferredSaleExpired(sale.occurredAt, now));
    for (const sale of expired) {
      await transaction.recordExpiry(sale.id, deferredSaleRegularizationTask(sale, now));
    }
    return { kind: "regularized", count: expired.length };
  });
}
