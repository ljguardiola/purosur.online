import type { AlertKind, AlertLevel } from "./alert-catalog.js";
import { alertKindPolicy } from "./alert-kind-policy.js";
import { isOpenAlert } from "./open-alert-state.js";

export const ESCALATED_LEVEL = "critical" as const satisfies AlertLevel;

export function escalatesAt(kind: AlertKind, openedAt: Date): Date | null {
  const { escalatesAfterMs } = alertKindPolicy(kind);
  return escalatesAfterMs === null ? null : new Date(openedAt.getTime() + escalatesAfterMs);
}

export function isDueForEscalation(
  alert: { level: AlertLevel; resolvedAt: Date | null; escalateAt: Date | null },
  now: Date,
): boolean {
  return (
    isOpenAlert(alert) &&
    alert.level === "warning" &&
    alert.escalateAt !== null &&
    alert.escalateAt <= now
  );
}
