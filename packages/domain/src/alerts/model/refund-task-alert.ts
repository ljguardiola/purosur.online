import type { AlertLevel } from "./alert-catalog.js";
import {
  REFUND_TASK_ALERT_OPENING_DELAY_MS,
  REFUND_TASK_ESCALATION_DELAY_MS,
} from "./alert-kind-policy.js";

export function refundTaskAlertIsDue(refundOpenedAt: Date, now: Date): boolean {
  return now.getTime() - refundOpenedAt.getTime() >= REFUND_TASK_ALERT_OPENING_DELAY_MS;
}

export function refundTaskAlertLevel(refundOpenedAt: Date, now: Date): AlertLevel {
  return now.getTime() - refundOpenedAt.getTime() >= REFUND_TASK_ESCALATION_DELAY_MS
    ? "critical"
    : "warning";
}
