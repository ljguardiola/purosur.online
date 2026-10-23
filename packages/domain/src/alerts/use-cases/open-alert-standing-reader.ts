import type { AlertKind, AlertLevel } from "../model/alert-catalog.js";

export interface OpenAlertStanding {
  scope: string;
  level: AlertLevel;
  escalatedAt: Date | null;
}

export interface OpenAlertStandingReader {
  openAlertsOfScopes(kind: AlertKind, scopes: readonly string[]): Promise<OpenAlertStanding[]>;
}
