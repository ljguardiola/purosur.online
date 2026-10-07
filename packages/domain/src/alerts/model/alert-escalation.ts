import type { AlertKind, AlertLevel } from "./alert-catalog.js";
import type { OpenAlertInput } from "./alert-details.js";
import { alertKindPolicy } from "./alert-kind-policy.js";
import { isOpenAlert } from "./open-alert-state.js";

export const ESCALATED_LEVEL = "critical" as const satisfies AlertLevel;

export function escalatesAt({ kind, detail }: OpenAlertInput, openedAt: Date): Date | null {
  const escalation = alertKindPolicy(kind).escalation;
  if (escalation === null) {
    return null;
  }
  if (escalation.kind === "afterOpening") {
    return new Date(openedAt.getTime() + escalation.delayMs);
  }
  return "notAfter" in detail ? new Date(Date.parse(detail.notAfter) - escalation.leadMs) : null;
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
