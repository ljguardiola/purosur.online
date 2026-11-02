import type { PurchaseOrderSummary } from "@purosur/contracts";
import type { Tone } from "@purosur/ui";

type PurchaseOrderStatus = { tone: Tone; label: string };

const STATUSES = {
  DRAFT: { tone: "warning", label: "Borrador" },
  SENT: { tone: "info", label: "Enviado" },
  CANCELLED: { tone: "neutral", label: "Cancelado" },
} satisfies Record<PurchaseOrderSummary["state"], PurchaseOrderStatus>;

export function purchaseOrderStatusOf(state: PurchaseOrderSummary["state"]): PurchaseOrderStatus {
  return STATUSES[state];
}
