import type { StartupPending } from "@purosur/contracts";

export function hasStartupPendingItems(pending: StartupPending): boolean {
  return (
    pending.sales_to_print.length > 0 ||
    pending.unknown_fiscal_documents.length > 0 ||
    pending.pending_payments.length > 0 ||
    pending.paid_orders_without_sale.length > 0 ||
    pending.paid_order_discovery !== "checked"
  );
}

export function startupPendingMayChange(pending: StartupPending): boolean {
  return hasStartupPendingItems(pending) || pending.selling_blocked;
}
