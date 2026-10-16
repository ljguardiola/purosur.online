import type { TagProps } from "@purosur/ui";
import { formatCents } from "@purosur/ui";
import type { SaleDetail } from "../shell/sale-receipt-text";
import { paymentMethodName } from "./sale-history-text";

type Voidability = SaleDetail["voidability"];

export type VoidRefusal = Extract<Voidability, { kind: "not_voidable" }>["refusal"];
export type VoidRefund = Extract<Voidability, { kind: "voidable" }>["refunds"][number];

export function voidRefusalReason(refusal: VoidRefusal): string | undefined {
  switch (refusal) {
    case "session_closed":
      return "La sesión de la venta ya cerró. Se tramita como devolución.";
    case "invoice_in_flight":
      return "La factura se está pidiendo a ARCA. Vas a poder anular cuando termine el trámite.";
    case "carries_invoice":
      return "La caja todavía no anula una venta con factura. Se tramita como devolución.";
    case "not_completed":
      return undefined;
  }
}

export function voidRefundPresentation(refund: VoidRefund): {
  title: string;
  description: string;
  chip: { label: string; tone: TagProps["tone"] };
  pending: boolean;
} {
  const title = `${paymentMethodName(refund.method)} · ${formatCents(refund.amount)}`;
  if (refund.state === "APPROVED") {
    return {
      title,
      description: "Lo devolvés en efectivo en el momento.",
      chip: { label: "En el acto", tone: "success" },
      pending: false,
    };
  }
  return {
    title,
    description: refund.sent_by_cloud
      ? "Queda un reembolso pendiente que la nube envía a Mercado Pago al confirmarlo."
      : "Queda un reembolso pendiente: una persona lo hace por fuera de la caja.",
    chip: { label: "Pendiente", tone: "info" },
    pending: true,
  };
}
