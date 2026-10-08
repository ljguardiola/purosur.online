const ARCA_ENVIRONMENT_LABELS: ReadonlyMap<string, string> = new Map([
  ["production", "Producción"],
  ["homologation", "Homologación"],
]);

export function alertScopeLabel(kind: string, scopeDisplay: string): string {
  return kind === "arca_certificate_expiring"
    ? (ARCA_ENVIRONMENT_LABELS.get(scopeDisplay) ?? scopeDisplay)
    : scopeDisplay;
}
