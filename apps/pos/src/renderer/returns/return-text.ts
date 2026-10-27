import type {
  RefundAllocationRefusalBody,
  ReturnDraftLineBody,
  ReturnLineRefusalBody,
} from "@purosur/contracts";
import type { NoticeTone } from "@purosur/ui";
import { formatCalendarDayNumeric, formatCents, formatWeight } from "@purosur/ui";
import type { SaleForReturn, SaleLineForReturn } from "./return-sale";

export type ReturnReasonValue = NonNullable<ReturnDraftLineBody["reason"]>;
export type ReturnDispositionValue = NonNullable<ReturnDraftLineBody["disposition"]>;

export const REASON_OPTIONS = [
  { value: "change_of_mind", label: "Arrepentimiento" },
  { value: "defective", label: "Defecto" },
] as const satisfies readonly { value: ReturnReasonValue; label: string }[];

export const DISPOSITION_OPTIONS = [
  { value: "restock", label: "A la venta" },
  { value: "discard", label: "Descarte" },
] as const satisfies readonly { value: ReturnDispositionValue; label: string }[];

const REASON_WINDOW_NAMES: Record<ReturnReasonValue, string> = {
  change_of_mind: "arrepentimiento",
  defective: "defecto",
};

export function dispositionOutcomeText(disposition: ReturnDispositionValue): string {
  return disposition === "restock" ? "vuelve a la venta" : "se descarta";
}

export function quantityText(saleUnit: SaleLineForReturn["sale_unit"], quantity: number): string {
  return saleUnit === "KG" ? formatWeight(quantity) : `${quantity} u`;
}

export type FindRefusalKind =
  | "not_found"
  | "voided"
  | "lacks_permission"
  | "not_a_ticket_qr"
  | "unavailable";

export function findRefusalText(kind: FindRefusalKind): { title: string; description?: string } {
  switch (kind) {
    case "not_found":
      return { title: "No encontramos esa venta en esta caja." };
    case "voided":
      return { title: "Esa venta está anulada: no se puede devolver." };
    case "lacks_permission":
      return {
        title: "Hacer devoluciones necesita permiso",
        description: "Elegí quién autoriza, ingresá su PIN y volvé a escanear el ticket.",
      };
    case "not_a_ticket_qr":
      return {
        title: "Ese QR no es de un ticket",
        description:
          "Escaneá el QR de la factura C o del documento de una venta diferida, o tipeá los números impresos.",
      };
    case "unavailable":
      return { title: "No se pudo buscar la venta", description: "Probá de nuevo." };
  }
}

export function lineRefusalNotice(
  refusal: ReturnLineRefusalBody,
  {
    product_name: name,
    sale_unit: saleUnit,
  }: Pick<SaleLineForReturn, "product_name" | "sale_unit">,
): string {
  switch (refusal.kind) {
    case "missing_reason":
      return `Elegí el motivo de ${name}.`;
    case "missing_disposition":
      return `Elegí qué pasa con la mercadería de ${name}.`;
    case "quantity_exceeds_returnable":
      return `${name}: se pueden devolver hasta ${quantityText(saleUnit, refusal.returnable)}.`;
    case "promotion_whole_only":
      return `${name}: la promoción se devuelve completa, ${quantityText(saleUnit, refusal.returnable)}.`;
    case "outside_window":
      return `Venció el plazo por ${REASON_WINDOW_NAMES[refusal.reason]}: se podía hasta el ${formatCalendarDayNumeric(refusal.last_allowed_day)}.`;
    case "unknown_line":
      return `${name}: esa línea ya no está en la venta.`;
    case "duplicate_line":
      return `${name}: la línea está repetida.`;
    case "invalid_quantity":
      return `${name}: ingresá una cantidad mayor a 0.`;
  }
}

export function refundRefusalText(refusal: RefundAllocationRefusalBody): string {
  switch (refusal.kind) {
    case "unknown_payment":
      return "Ese pago no es de esta venta.";
    case "invalid_amount":
      return "Ingresá un importe mayor a 0 en cada pago.";
    case "not_cash":
      return "Solo se puede reintegrar el pago en efectivo.";
    case "exceeds_payment":
      return `El pago solo permite reintegrar ${formatCents(refusal.remaining)}.`;
    case "total_mismatch":
      return `Lo que se reintegra por los pagos tiene que sumar ${formatCents(refusal.refundable_total)}.`;
  }
}

export function paymentIneligibleText(reason: "not_cash" | "nothing_left"): string {
  return reason === "not_cash"
    ? "Este medio todavía no se reintegra desde la caja"
    : "Este pago ya se reintegró completo";
}

export function windowTags(
  windows: SaleForReturn["windows"],
): { label: string; tone: Extract<NoticeTone, "success" | "warning"> }[] {
  const tag = (
    name: string,
    { open, last_allowed_day: day }: SaleForReturn["windows"]["defective"],
  ) =>
    open
      ? { label: `${name} hasta ${formatCalendarDayNumeric(day)}`, tone: "success" as const }
      : { label: `${name} vencido`, tone: "warning" as const };
  return [tag("Arrepentimiento", windows.change_of_mind), tag("Defecto", windows.defective)];
}
