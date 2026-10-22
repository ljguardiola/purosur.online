import { runDeferredSalesCatchUp } from "./catch-up-deferred-sales.js";
import type { CatchUpDeferredSalesPorts } from "./catch-up-deferred-sales-ports.js";

export interface InvoiceDeferredSalesUpToInput {
  saleId: string;
}

export type InvoiceDeferredSalesUpToOutcome =
  | { kind: "invoiced" }
  | { kind: "not_pending" }
  | { kind: "not_yet"; cause: "cannot_authorize" | "older_sale_blocking" };

export async function invoiceDeferredSalesUpTo(
  ports: CatchUpDeferredSalesPorts,
  { saleId }: InvoiceDeferredSalesUpToInput,
): Promise<InvoiceDeferredSalesUpToOutcome> {
  const { outcome, stoppedAtSaleId } = await runDeferredSalesCatchUp(ports, saleId);
  if (outcome.kind === "completed") {
    return outcome.invoiced.includes(saleId) ? { kind: "invoiced" } : { kind: "not_pending" };
  }
  const blockedByOlderSale = stoppedAtSaleId !== undefined && stoppedAtSaleId !== saleId;
  return {
    kind: "not_yet",
    cause: blockedByOlderSale ? "older_sale_blocking" : "cannot_authorize",
  };
}
