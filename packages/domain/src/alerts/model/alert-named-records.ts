import { isAlertKind } from "./alert-catalog.js";
import { alertKindPolicy } from "./alert-kind-policy.js";

const NAMED_SCOPE_KINDS = ["user", "register", "device"];

export function alertScopeNamesRecord(kind: string): boolean {
  return isAlertKind(kind) && NAMED_SCOPE_KINDS.includes(alertKindPolicy(kind).scopeKind);
}

export function alertActorId(detail: Record<string, unknown> | undefined): string | undefined {
  const actorId = detail?.["actorId"];
  return typeof actorId === "string" ? actorId : undefined;
}

export function alertNamedRecordIds(alert: {
  kind: string;
  scope: string;
  detail?: Record<string, unknown>;
}): string[] {
  const ids = alertScopeNamesRecord(alert.kind) ? [alert.scope] : [];
  const actorId = alertActorId(alert.detail);
  return actorId === undefined ? ids : [...ids, actorId];
}
