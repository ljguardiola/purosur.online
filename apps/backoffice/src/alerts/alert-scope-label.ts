import type { AlertScopeKind } from "@purosur/domain";
import { formatCalendarDayRange, formatInvoiceNumber, formatPointOfSaleNumber } from "@purosur/ui";

const ARCA_ENVIRONMENT_LABELS: ReadonlyMap<string, string> = new Map([
  ["production", "Producción"],
  ["homologation", "Homologación"],
]);

const FISCAL_DOCUMENT_TYPE_LABELS: ReadonlyMap<string, string> = new Map([
  ["factura_c", "Factura C"],
  ["credit_note_c", "Nota de crédito C"],
]);

function fiscalDocumentScopeLabel(scopeDisplay: string): string {
  const [pointOfSale = "", documentType = ""] = scopeDisplay.split(":");
  const label = FISCAL_DOCUMENT_TYPE_LABELS.get(documentType);
  return label === undefined ? scopeDisplay : `Punto de venta ${pointOfSale} · ${label}`;
}

function pointOfSaleFortnightScopeLabel(scopeDisplay: string): string {
  const [pointOfSale = "", start = "", end = ""] = scopeDisplay.split(":");
  return /^\d+$/.test(pointOfSale) && start !== "" && end !== ""
    ? `Punto de venta ${formatPointOfSaleNumber(Number(pointOfSale))} · ${formatCalendarDayRange(start, end)}`
    : scopeDisplay;
}

function pointOfSaleDocumentNumberScopeLabel(scopeDisplay: string): string {
  const [pointOfSale = "", documentType = "", number = ""] = scopeDisplay.split(":");
  const label = FISCAL_DOCUMENT_TYPE_LABELS.get(documentType);
  return label !== undefined && /^\d+$/.test(pointOfSale) && /^\d+$/.test(number)
    ? `Punto de venta ${formatPointOfSaleNumber(Number(pointOfSale))} · ${label} · ${formatInvoiceNumber(Number(number))}`
    : scopeDisplay;
}

export function alertScopeLabel(scopeKind: string | null, scopeDisplay: string): string {
  if (scopeKind === ("pointOfSaleDocumentType" satisfies AlertScopeKind)) {
    return fiscalDocumentScopeLabel(scopeDisplay);
  }
  if (scopeKind === ("pointOfSaleDocumentNumber" satisfies AlertScopeKind)) {
    return pointOfSaleDocumentNumberScopeLabel(scopeDisplay);
  }
  if (scopeKind === ("refund" satisfies AlertScopeKind)) {
    return "Tarea de reembolso";
  }
  if (scopeKind === ("fiscalDocument" satisfies AlertScopeKind)) {
    return "Comprobante";
  }
  if (scopeKind === ("branch" satisfies AlertScopeKind)) {
    return "Sucursal";
  }
  if (scopeKind === ("pointOfSaleFortnight" satisfies AlertScopeKind)) {
    return pointOfSaleFortnightScopeLabel(scopeDisplay);
  }
  return scopeKind === ("environment" satisfies AlertScopeKind)
    ? (ARCA_ENVIRONMENT_LABELS.get(scopeDisplay) ?? scopeDisplay)
    : scopeDisplay;
}
