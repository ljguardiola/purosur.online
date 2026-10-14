import type { PendingRefundsBody } from "@purosur/contracts";
import { refundRefusalReason } from "./refund-refusal-reason";

type Refund = PendingRefundsBody["refunds"][number];

export function refundDeliveryStatus(
  refund: Pick<Refund, "sent_by_cloud" | "confirmed_at" | "sent_at" | "last_refusal_reason">,
): string | null {
  if (!refund.sent_by_cloud) {
    return null;
  }
  if (refund.confirmed_at === null) {
    return "Sin confirmar";
  }
  if (refund.last_refusal_reason === "insufficient_balance") {
    return "Sin saldo en Mercado Pago · se reintenta";
  }
  if (refund.last_refusal_reason !== null) {
    return `Mercado Pago lo rechazó: ${refundRefusalReason(refund.last_refusal_reason)}`;
  }
  return refund.sent_at === null
    ? "Confirmado · se envía al reconectar"
    : "Enviado a Mercado Pago · en proceso";
}
