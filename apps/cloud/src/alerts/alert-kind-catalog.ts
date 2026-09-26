import type { AlertAudience, AlertKind, AlertLevel } from "@purosur/contracts";

/** What `alerts.scope` identifies for a kind: a user id, or a source address (not looked up as a user). */
export type AlertScopeKind = "user" | "sourceAddress";

export interface AlertKindDefinition {
  kind: AlertKind;
  /** The level an alert of this kind opens at; `alerts.level` moves to `critical` from here once escalated. */
  level: AlertLevel;
  /** How long an open alert of this kind waits before escalating from Warning to Critical, or `null` if it never escalates. */
  escalatesAfterMs: number | null;
  audience: AlertAudience;
  scopeKind: AlertScopeKind;
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

// Each fact keeps its own kind instead of sharing one with subtypes: the deduplication key is the
// kind plus its scope, so sharing a kind would let a still-open record for one fact swallow a
// same-night occurrence of a different fact instead of that second fact opening its own alert.
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
