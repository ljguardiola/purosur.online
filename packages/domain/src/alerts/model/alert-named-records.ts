import { isAlertKind } from "./alert-catalog.js";
import { alertKindPolicy } from "./alert-kind-policy.js";

import { registerFortnightScopeRegisterId } from "./register-fortnight-scope.js";

export function alertScopeRecordId(alert: { kind: string; scope: string }): string | undefined {
  if (!isAlertKind(alert.kind)) {
    return undefined;
  }
  const { scopeKind } = alertKindPolicy(alert.kind);
  if (scopeKind === "user" || scopeKind === "register" || scopeKind === "syncDevice") {
    return alert.scope;
  }
  return scopeKind === "registerFortnight"
    ? registerFortnightScopeRegisterId(alert.scope)
    : undefined;
}

function pointOfSaleFortnightRegisterId(alert: {
  kind: string;
  detail?: Record<string, unknown>;
}): string | undefined {
  if (
    !isAlertKind(alert.kind) ||
    alertKindPolicy(alert.kind).scopeKind !== "pointOfSaleFortnight"
  ) {
    return undefined;
  }
  const registerId = alert.detail?.["registerId"];
  return typeof registerId === "string" ? registerId : undefined;
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
  const registerId = pointOfSaleFortnightRegisterId(alert);
  if (registerId !== undefined) {
    ids.push(registerId);
  }
  const actorId = alertActorId(alert.detail);
  return actorId === undefined ? ids : [...ids, actorId];
}
