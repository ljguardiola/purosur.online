import type { PendingRefundsBody } from "@purosur/contracts";
import { refundRefusalReason } from "./refund-refusal-reason";

type Refund = PendingRefundsBody["refunds"][number];

export function refundDeliveryStatus(
  refund: Pick<Refund, "delivery_stage" | "last_refusal_reason">,
): string | null {
  switch (refund.delivery_stage) {
    case null:
      return null;
    case "unconfirmed":
      return "Sin confirmar";
    case "confirmed":
      return "Confirmado · se envía al reconectar";
    case "sent":
      return "Enviado a Mercado Pago · en proceso";
    case "waiting_for_balance":
      return "Sin saldo en Mercado Pago · se reintenta";
    case "refused":
      return `Mercado Pago lo rechazó: ${refundRefusalReason(refund.last_refusal_reason ?? "")}`;
  }
}
