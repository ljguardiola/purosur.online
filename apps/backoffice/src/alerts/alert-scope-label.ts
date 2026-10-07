const ARCA_ENVIRONMENT_LABELS: Record<string, string> = {
  production: "Producción",
  homologation: "Homologación",
};

export function alertScopeLabel(kind: string, scopeDisplay: string): string {
  return kind === "arca_certificate_expiring"
    ? (ARCA_ENVIRONMENT_LABELS[scopeDisplay] ?? scopeDisplay)
    : scopeDisplay;
}
