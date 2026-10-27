import { isDeferredSaleUninvoiceable } from "../model/deferred-backlog.js";
import { deferredSaleRegularizationTask } from "../model/deferred-sale-record.js";
import type { RegularizeUninvoiceableDeferredSalesPorts } from "./regularize-uninvoiceable-deferred-sales-ports.js";

export type RegularizeUninvoiceableDeferredSalesOutcome = { kind: "regularized"; count: number };

export async function regularizeUninvoiceableDeferredSales({
  store,
  clock,
  zoneRules,
}: RegularizeUninvoiceableDeferredSalesPorts): Promise<RegularizeUninvoiceableDeferredSalesOutcome> {
  const now = clock.now();
  return store.transaction(async (transaction) => {
    const candidates = await transaction.lockPendingDeferredSales();
    const uninvoiceable = candidates.filter(
      (sale) =>
        !sale.mayAlreadyBeInvoiced &&
        isDeferredSaleUninvoiceable(
          sale.occurredAt,
          now,
          sale.lastAuthorizedIssuedOn,
          zoneRules.zoneRules(),
        ),
    );
    for (const sale of uninvoiceable) {
      await transaction.recordExpiry(sale.id, deferredSaleRegularizationTask(sale, now));
    }
    return { kind: "regularized", count: uninvoiceable.length };
  });
}
