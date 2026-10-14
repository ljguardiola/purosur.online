import type { ConfirmedRefundBody } from "@purosur/contracts";
import type { NoticeTone } from "@purosur/ui";
import { refundRefusalReason } from "./refund-refusal-reason";

export type RefundConfirmationNotice = {
  tone: NoticeTone;
  title: string;
  description: string;
};

function sentence(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

export function refundConfirmationNotice(body: ConfirmedRefundBody): RefundConfirmationNotice {
  switch (body.outcome) {
    case "sent":
      return {
        tone: "success",
        title: "Reembolso enviado a Mercado Pago",
        description: "Queda en proceso hasta que lo acredite.",
      };
    case "done":
      return {
        tone: "success",
        title: "Mercado Pago acreditó el reembolso",
        description: "Ya no queda pendiente.",
      };
    case "insufficient_balance":
      return {
        tone: "warning",
        title: "La cuenta de Mercado Pago no tiene saldo suficiente",
        description: "El reembolso queda pendiente y se reintenta solo.",
      };
    case "refused":
      return {
        tone: "error",
        title: "Mercado Pago rechazó el reembolso",
        description: sentence(refundRefusalReason(body.reason)),
      };
    case "provider_unavailable":
      return {
        tone: "warning",
        title: "No se pudo contactar a Mercado Pago",
        description: "Se reintenta solo.",
      };
  }
}
