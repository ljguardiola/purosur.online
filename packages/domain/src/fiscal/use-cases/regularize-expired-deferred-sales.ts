import { isDeferredSaleUninvoiceable } from "../model/deferred-backlog.js";
import { deferredSaleRegularizationTask } from "../model/deferred-sale-record.js";
import type { RegularizeExpiredDeferredSalesPorts } from "./regularize-expired-deferred-sales-ports.js";

export type RegularizeExpiredDeferredSalesOutcome = { kind: "regularized"; count: number };

export async function regularizeExpiredDeferredSales({
  store,
  clock,
}: RegularizeExpiredDeferredSalesPorts): Promise<RegularizeExpiredDeferredSalesOutcome> {
  const now = clock.now();
  return store.transaction(async (transaction) => {
    const candidates = await transaction.lockPendingDeferredSales();
    const uninvoiceable = candidates.filter((sale) =>
      isDeferredSaleUninvoiceable(sale.occurredAt, now, sale.lastAuthorizedIssuedOn),
    );
    for (const sale of uninvoiceable) {
      await transaction.recordExpiry(sale.id, deferredSaleRegularizationTask(sale, now));
    }
    return { kind: "regularized", count: uninvoiceable.length };
  });
}
