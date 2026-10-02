import { isAlertKind } from "./alert-catalog.js";
import { alertKindPolicy } from "./alert-kind-policy.js";

const NAMED_SCOPE_KINDS = ["user", "register"];

export function alertNamedRecordIds(alert: {
  kind: string;
  scope: string;
  detail?: Record<string, unknown>;
}): string[] {
  const namesScope =
    isAlertKind(alert.kind) && NAMED_SCOPE_KINDS.includes(alertKindPolicy(alert.kind).scopeKind);
  const ids = namesScope ? [alert.scope] : [];
  const actorId = alert.detail?.["actorId"];
  return typeof actorId === "string" ? [...ids, actorId] : ids;
}
