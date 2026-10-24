import { type CatchUpStopReason, runDeferredSalesCatchUp } from "./catch-up-deferred-sales.js";
import type { CatchUpDeferredSalesPorts } from "./catch-up-deferred-sales-ports.js";

export interface InvoiceDeferredSalesUpToInput {
  saleId: string;
}

export type InvoiceDeferredSalesUpToOutcome =
  | { kind: "invoiced" }
  | { kind: "not_pending" }
  | { kind: "not_yet"; cause: InvoiceDeferredSalesUpToCause };

type InvoiceDeferredSalesUpToCause =
  | "cannot_authorize"
  | "older_sale_blocking"
  | "not_authorized";

export async function invoiceDeferredSalesUpTo(
  ports: CatchUpDeferredSalesPorts,
  { saleId }: InvoiceDeferredSalesUpToInput,
): Promise<InvoiceDeferredSalesUpToOutcome> {
  const { outcome, stoppedAtSaleId } = await runDeferredSalesCatchUp(ports, saleId);
  if (outcome.kind === "completed") {
    return outcome.invoiced.includes(saleId) ? { kind: "invoiced" } : { kind: "not_pending" };
  }
  return { kind: "not_yet", cause: causeOf(outcome.reason, stoppedAtSaleId, saleId) };
}

function causeOf(
  reason: CatchUpStopReason,
  stoppedAtSaleId: string | undefined,
  saleId: string,
): InvoiceDeferredSalesUpToCause {
  const stoppedAtOlderSale = stoppedAtSaleId !== saleId;
  switch (reason.kind) {
    case "retry_later":
      return stoppedAtOlderSale ? "older_sale_blocking" : "cannot_authorize";
    case "authorization_not_granted":
      if (stoppedAtOlderSale) {
        return "older_sale_blocking";
      }
      return reason.outcome === "rejected" ? "not_authorized" : "cannot_authorize";
    default:
      return "cannot_authorize";
  }
}
