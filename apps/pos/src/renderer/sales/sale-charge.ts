import type { OpenSale } from "@purosur/contracts";

export function paidOrderToApplyOf(sale: OpenSale | null) {
  return sale?.rebuilt_paid_order?.applied === false ? sale.rebuilt_paid_order : null;
}

export function isChargeable(sale: OpenSale | null): boolean {
  return (
    sale !== null &&
    sale.lines.length > 0 &&
    sale.total !== 0 &&
    sale.charge_refusal === null &&
    paidOrderToApplyOf(sale) === null
  );
}
