import type { PurchaseOrderSummary } from "@purosur/contracts";
import type { Tone } from "@purosur/ui";

type PurchaseOrderStatus = { tone: Tone; label: string };

const STATUSES = {
  DRAFT: { tone: "warning", label: "Borrador" },
  SENT: { tone: "info", label: "Enviado" },
  PARTIALLY_RECEIVED: { tone: "info", label: "Recibido en parte" },
  RECEIVED: { tone: "success", label: "Recibido" },
  CANCELLED: { tone: "neutral", label: "Cancelado" },
} satisfies Record<PurchaseOrderSummary["state"], PurchaseOrderStatus>;

export function purchaseOrderStatusOf(state: PurchaseOrderSummary["state"]): PurchaseOrderStatus {
  return STATUSES[state];
}
