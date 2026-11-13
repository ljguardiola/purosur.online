import type {
  RefundAllocationRefusalBody,
  ReturnDraftLineBody,
  ReturnLineRefusalBody,
} from "@purosur/contracts";
import { formatCalendarDayNumeric, formatCents, formatWeight } from "@purosur/ui";
import type { PaymentForReturn, SaleLineForReturn } from "./return-sale";

type PlannedRefundState = PaymentForReturn["refund_state"];

export type ReturnReasonValue = NonNullable<ReturnDraftLineBody["reason"]>;
export type ReturnDispositionValue = NonNullable<ReturnDraftLineBody["disposition"]>;
export type ReturnResolutionValue = NonNullable<ReturnDraftLineBody["resolution"]>;

export const REASON_OPTIONS = [
  { value: "change_of_mind", label: "Arrepentimiento" },
  { value: "defective", label: "Defecto" },
] as const satisfies readonly { value: ReturnReasonValue; label: string }[];

export const DISPOSITION_OPTIONS = [
  { value: "restock", label: "A la venta" },
  { value: "discard", label: "Descarte" },
] as const satisfies readonly { value: ReturnDispositionValue; label: string }[];

export const RESOLUTION_LABELS: Record<ReturnResolutionValue, string> = {
  refund: "Reintegro",
  exchange: "Cambio",
};

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
  | "needs_connection"
  | "lookup_failed"
  | "not_a_ticket_qr"
  | "not_a_ticket_number"
  | "unavailable";

export function findRefusalText(kind: FindRefusalKind): string {
  switch (kind) {
    case "not_found":
      return "No encontramos esa venta en esta sucursal.";
    case "voided":
      return "Esa venta está anulada: no se puede devolver.";
    case "needs_connection":
      return "Se necesita conexión a internet para buscar una venta de otra caja.";
    case "lookup_failed":
      return "No se pudo buscar la venta en las otras cajas. Probá de nuevo.";
    case "not_a_ticket_qr":
      return "Ese QR no es de un ticket. Escaneá el QR de la factura C o del documento de una venta diferida, o tipeá los números impresos.";
    case "not_a_ticket_number":
      return "Tipeá el número impreso del ticket, como 00003-00001192.";
    case "unavailable":
      return "No se pudo buscar la venta. Probá de nuevo.";
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
    case "missing_resolution":
      return `Elegí si se reintegra o se cambia ${name}.`;
    case "resolution_not_offered":
      return `${name}: con este motivo no se puede cambiar por otra igual.`;
    case "quantity_exceeds_returnable":
      return `${name}: se pueden devolver hasta ${quantityText(saleUnit, refusal.returnable)}.`;
    case "promotion_whole_only":
      return `${name}: con este motivo, la promoción se devuelve completa, ${quantityText(saleUnit, refusal.returnable)}.`;
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
    case "exceeds_payment":
      return `El pago solo permite reintegrar ${formatCents(refusal.remaining)}.`;
    case "total_mismatch":
      return `Lo que se reintegra por los pagos tiene que sumar ${formatCents(refusal.refundable_total)}.`;
  }
}

export const REFUND_WHEN_IN_TABLE = {
  APPROVED: "En el acto",
  PENDING: "Reembolso pendiente",
} as const satisfies Record<PlannedRefundState, string>;

export const REFUND_WHEN_IN_ROW = {
  APPROVED: "en el acto",
  PENDING: "reembolso pendiente",
} as const satisfies Record<PlannedRefundState, string>;
