import type { AlertKind } from "./alert-catalog.js";
import { alertKindPolicy } from "./alert-kind-policy.js";
import { isOpenAlert } from "./open-alert-state.js";

export function showsAlertScope(alert: { kind: AlertKind; resolvedAt: Date | null }): boolean {
  return alertKindPolicy(alert.kind).scopeKind !== "sourceAddress" || isOpenAlert(alert);
}
