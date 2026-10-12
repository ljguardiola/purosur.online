import type { AlertLevel } from "./alert-catalog.js";
import {
  FISCAL_UNKNOWN_ALERT_OPENING_DELAY_MS,
  FISCAL_UNKNOWN_ESCALATION_DELAY_MS,
} from "./alert-kind-policy.js";

export interface FiscalUnknownAlertKey {
  kind: "fiscal_unknown";
  scope: string;
}

export function fiscalUnknownAlertKey(fiscalDocumentId: string): FiscalUnknownAlertKey {
  return { kind: "fiscal_unknown", scope: fiscalDocumentId };
}

export function fiscalUnknownAlertIsDue(unclearSince: Date, now: Date): boolean {
  return now.getTime() - unclearSince.getTime() >= FISCAL_UNKNOWN_ALERT_OPENING_DELAY_MS;
}

export function fiscalUnknownAlertLevel(unclearSince: Date, now: Date): AlertLevel {
  return now.getTime() - unclearSince.getTime() >= FISCAL_UNKNOWN_ESCALATION_DELAY_MS
    ? "critical"
    : "warning";
}
