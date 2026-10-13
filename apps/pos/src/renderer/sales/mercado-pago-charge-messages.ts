import { formatCents } from "@purosur/ui";

export const ORDER_UNREACHABLE_MESSAGE =
  "No se pudo crear la orden porque la caja no llega a la nube. Cobrá con otro medio.";
export const CHARGE_IN_PROGRESS_MESSAGE =
  "Ya hay un cobro con Mercado Pago en curso para esta venta.";
export const ORDER_FAILED_MESSAGE = "No se pudo crear la orden. Probá de nuevo.";

export function exceedsPendingMessage(pending: number): string {
  return `No puede superar el saldo pendiente de ${formatCents(pending)}.`;
}
