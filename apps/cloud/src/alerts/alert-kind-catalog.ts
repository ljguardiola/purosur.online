import type { AlertAudience, AlertKind, AlertLevel } from "@purosur/contracts";

/** `user`: `alerts.scope` is a user id. `sourceAddress`: it's an address, never looked up as a user. */
export type AlertScopeKind = "user" | "sourceAddress";

export interface AlertKindDefinition {
  kind: AlertKind;
  /** The level an alert of this kind opens at; escalation moves it to `critical` from here. */
  level: AlertLevel;
  /** How long an open alert waits before escalating Warning to Critical; `null` if it never does. */
  escalatesAfterMs: number | null;
  audience: AlertAudience;
  scopeKind: AlertScopeKind;
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export const ALERT_KIND_CATALOG: readonly AlertKindDefinition[] = [
  {
    kind: "backoffice_passkey_changed",
    level: "warning",
    escalatesAfterMs: TWENTY_FOUR_HOURS_MS,
    audience: "all",
    scopeKind: "user",
  },
  {
    kind: "backoffice_recovery_requested",
    level: "warning",
    escalatesAfterMs: TWENTY_FOUR_HOURS_MS,
    audience: "all",
    scopeKind: "user",
  },
  {
    kind: "user_email_changed",
    level: "warning",
    escalatesAfterMs: TWENTY_FOUR_HOURS_MS,
    audience: "all",
    scopeKind: "user",
  },
  {
    kind: "backoffice_sign_in_lockout",
    level: "warning",
    escalatesAfterMs: TWENTY_FOUR_HOURS_MS,
    audience: "all",
    scopeKind: "sourceAddress",
  },
];

const ALERT_KIND_CATALOG_BY_KIND: ReadonlyMap<AlertKind, AlertKindDefinition> = new Map(
  ALERT_KIND_CATALOG.map((definition) => [definition.kind, definition]),
);

export function alertKindDefinition(kind: AlertKind): AlertKindDefinition {
  const definition = ALERT_KIND_CATALOG_BY_KIND.get(kind);
  if (!definition) {
    throw new Error(`no alert kind catalog entry for "${kind}"`);
  }
  return definition;
}
