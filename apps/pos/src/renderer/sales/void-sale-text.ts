import { formatCents } from "@purosur/ui";
import type { SaleDetail } from "../shell/sale-receipt-text";
import { paymentRowName } from "./sale-history-text";

type Voidability = SaleDetail["voidability"];

export type VoidRefusal = Extract<Voidability, { kind: "not_voidable" }>["refusal"];
export type VoidRefund = Extract<Voidability, { kind: "voidable" }>["refunds"][number];
export type VoidCreditNoteCorrects = Extract<
  Voidability,
  { kind: "voidable" }
>["credit_note_corrects"];

export function voidRefusalReason(refusal: VoidRefusal): string | undefined {
  switch (refusal) {
    case "session_closed":
      return "La sesión de la venta ya cerró. Se tramita como devolución.";
    case "has_return":
      return "Esta venta ya tiene una devolución: lo que queda se devuelve con otra devolución.";
    case "invoice_in_flight":
      return "La factura se está pidiendo a ARCA. Vas a poder anular cuando termine el trámite.";
    case "not_completed":
      return undefined;
  }
}

export function voidRefundRow(refund: VoidRefund): {
  name: string;
  label: string;
  value: string;
  pending: boolean;
} {
  const pending = refund.state !== "APPROVED";
  const name = paymentRowName(refund.method, refund.card_type);
  return {
    name,
    label: `${name} · ${pending ? "reembolso pendiente" : "en el acto"}`,
    value: formatCents(refund.amount),
    pending,
  };
}
