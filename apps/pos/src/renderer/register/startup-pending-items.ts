import type { StartupPending } from "@purosur/contracts";

export function hasStartupPendingItems(pending: StartupPending): boolean {
  return (
    pending.sales_to_print.length > 0 ||
    pending.unknown_fiscal_documents.length > 0 ||
    pending.pending_payments.length > 0
  );
}
