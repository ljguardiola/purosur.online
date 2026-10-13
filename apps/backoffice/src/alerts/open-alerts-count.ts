import type { AlertsOverview } from "@purosur/contracts";

export function openAlertsCount(overview: AlertsOverview): number {
  return (
    overview.critical.openCount + overview.warning.openCount + overview.informational.openCount
  );
}
