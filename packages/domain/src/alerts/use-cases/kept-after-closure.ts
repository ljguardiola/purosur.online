import { alertKindPolicy } from "../model/alert-kind-policy.js";
import type { LockedAlert } from "./alert-store.js";

export function keptAfterClosure(
  alert: LockedAlert,
  hash: (address: string) => string,
): Pick<LockedAlert, "scope" | "detail"> {
  if (alertKindPolicy(alert.kind).scopeKind !== "sourceAddress") {
    return { scope: alert.scope, detail: alert.detail };
  }
  const { sourceAddress } = alert.detail;
  return {
    scope: hash(alert.scope),
    detail: {
      ...alert.detail,
      ...(typeof sourceAddress === "string" ? { sourceAddress: hash(sourceAddress) } : {}),
    },
  };
}
