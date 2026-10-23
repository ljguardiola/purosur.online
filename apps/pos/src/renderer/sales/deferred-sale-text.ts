import type { FindDeferredSaleOutcome } from "@purosur/contracts";
import type { NoticeTone } from "@purosur/ui";
import { formatInvoiceNumber, formatPointOfSaleNumber } from "@purosur/ui";

export type FoundDeferredSale = Extract<FindDeferredSaleOutcome, { kind: "found" }>;

export type DeferredSaleRefusalKind =
  | "not_found"
  | "voided"
  | "expired"
  | "already_printed"
  | "not_a_deferred_sale_qr"
  | "lacks_permission"
  | "unavailable";

export function deferredSaleInvoiceNumber(invoice: FoundDeferredSale["invoice"]): string {
  return invoice.kind === "issued"
    ? `PV ${formatPointOfSaleNumber(invoice.point_of_sale)}\nNº ${formatInvoiceNumber(invoice.number)}`
    : "Se asigna al emitir";
}

const REFUSALS: Record<
  DeferredSaleRefusalKind,
  { tone: NoticeTone; title: string; description: string }
> = {
  not_found: {
    tone: "error",
    title: "No hay una venta diferida con ese código en esta caja",
    description: "Revisá el código, o buscala en la caja donde se hizo la venta.",
  },
  voided: {
    tone: "error",
    title: "Esa venta se anuló",
    description: "Una venta anulada no se factura.",
  },
  expired: {
    tone: "error",
    title: "Pasó el plazo para facturar esta venta",
    description: "Quedó como tarea para el dueño.",
  },
  already_printed: {
    tone: "info",
    title: "La factura ya se imprimió",
    description: "Si el cliente la perdió, reimprimí un duplicado.",
  },
  not_a_deferred_sale_qr: {
    tone: "error",
    title: "Ese QR no es de una venta diferida",
    description: "Escaneá el QR del documento no fiscal, o tipeá su código de consulta.",
  },
  lacks_permission: {
    tone: "error",
    title: "No tenés permiso para facturar ventas diferidas",
    description: "Pedile a alguien con permiso que la facture.",
  },
  unavailable: {
    tone: "error",
    title: "No se pudo buscar la venta",
    description: "Probá de nuevo.",
  },
};

export function deferredSaleRefusal(kind: DeferredSaleRefusalKind) {
  return REFUSALS[kind];
}
