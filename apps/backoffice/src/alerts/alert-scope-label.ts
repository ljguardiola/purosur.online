import type { AlertScopeKind } from "@purosur/domain";

const ARCA_ENVIRONMENT_LABELS: ReadonlyMap<string, string> = new Map([
  ["production", "Producción"],
  ["homologation", "Homologación"],
]);

const FISCAL_DOCUMENT_TYPE_LABELS: ReadonlyMap<string, string> = new Map([
  ["factura_c", "Factura C"],
]);

function fiscalDocumentScopeLabel(scopeDisplay: string): string {
  const [pointOfSale = "", documentType = ""] = scopeDisplay.split(":");
  const label = FISCAL_DOCUMENT_TYPE_LABELS.get(documentType);
  return label === undefined ? scopeDisplay : `Punto de venta ${pointOfSale} · ${label}`;
}

export function alertScopeLabel(scopeKind: string | null, scopeDisplay: string): string {
  if (scopeKind === ("pointOfSaleDocumentType" satisfies AlertScopeKind)) {
    return fiscalDocumentScopeLabel(scopeDisplay);
  }
  return scopeKind === ("environment" satisfies AlertScopeKind)
    ? (ARCA_ENVIRONMENT_LABELS.get(scopeDisplay) ?? scopeDisplay)
    : scopeDisplay;
}
