import { alertKindPolicy, isAlertKind, showsAlertScope } from "@purosur/domain";

interface ScopedAlert {
  kind: string;
  scope: string;
  resolvedAt: Date | null;
}

// A closed alert of a source-address kind keeps only an unsalted, brute-forceable hash of the
// address, so it is stored but never sent.
export function holdsOnlySourceAddressHash(
  alert: Pick<ScopedAlert, "kind" | "resolvedAt">,
): boolean {
  const { kind, resolvedAt } = alert;
  return isAlertKind(kind) && !showsAlertScope({ kind, resolvedAt });
}

export function wireScope(alert: ScopedAlert): string | null {
  return holdsOnlySourceAddressHash(alert) ? null : alert.scope;
}

export function scopeDisplay(
  alert: ScopedAlert,
  namesById: ReadonlyMap<string, string>,
): string | null {
  const { kind, resolvedAt } = alert;
  if (!isAlertKind(kind)) {
    return alert.scope;
  }
  if (!showsAlertScope({ kind, resolvedAt })) {
    return null;
  }
  if (alertKindPolicy(kind).scopeKind === "sourceAddress") {
    return alert.scope;
  }
  return namesById.get(alert.scope) ?? alert.scope;
}
