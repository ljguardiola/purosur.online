import type { AlertLevel } from "./alert-catalog.js";
import type { OpenAlertInput } from "./alert-details.js";
import { alertKindPolicy } from "./alert-kind-policy.js";
import { isOpenAlert } from "./open-alert-state.js";

export const ALERT_ESCALATION_CHECK_INTERVAL_MS = 5 * 60 * 1000;

export const ESCALATED_LEVEL = "critical" as const satisfies AlertLevel;

function subjectOpenedAt(input: OpenAlertInput): string | null {
  switch (input.kind) {
    case "refund_task":
      return input.detail.refundOpenedAt;
    case "fiscal_unknown":
      return input.detail.unclearSince;
    default:
      return null;
  }
}

export function escalatesAt(input: OpenAlertInput, openedAt: Date): Date | null {
  const { kind, detail } = input;
  const escalation = alertKindPolicy(kind).escalation;
  if (escalation === null) {
    return null;
  }
  if (escalation.kind === "afterOpening") {
    return new Date(openedAt.getTime() + escalation.delayMs);
  }
  if (escalation.kind === "afterSubjectOpening") {
    const openedAtOfSubject = subjectOpenedAt(input);
    return openedAtOfSubject === null
      ? null
      : new Date(Date.parse(openedAtOfSubject) + escalation.delayMs);
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
