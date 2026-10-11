import { isAlertKind } from "./alert-catalog.js";
import { alertKindPolicy } from "./alert-kind-policy.js";

import { registerFortnightScopeRegisterId } from "./register-fortnight-scope.js";

export function alertScopeRecordId(alert: { kind: string; scope: string }): string | undefined {
  if (!isAlertKind(alert.kind)) {
    return undefined;
  }
  const { scopeKind } = alertKindPolicy(alert.kind);
  if (scopeKind === "user" || scopeKind === "register") {
    return alert.scope;
  }
  return scopeKind === "registerFortnight"
    ? registerFortnightScopeRegisterId(alert.scope)
    : undefined;
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
  const recordId = alertScopeRecordId(alert);
  const ids = recordId === undefined ? [] : [recordId];
  const actorId = alertActorId(alert.detail);
  return actorId === undefined ? ids : [...ids, actorId];
}
