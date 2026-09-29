import type { AlertAudience, AlertKind, AlertLevel } from "@purosur/domain";

export type AlertScopeKind = "user" | "sourceAddress";

export interface AlertKindDefinition {
  kind: AlertKind;
  level: AlertLevel;
  escalatesAfterMs: number | null;
  audience: AlertAudience;
  scopeKind: AlertScopeKind;
  deduplicates: boolean;
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export const ALERT_KIND_CATALOG: readonly AlertKindDefinition[] = [
  {
    kind: "backoffice_passkey_changed",
    level: "warning",
    escalatesAfterMs: TWENTY_FOUR_HOURS_MS,
    audience: "all",
    scopeKind: "user",
    deduplicates: true,
  },
  {
    kind: "backoffice_recovery_requested",
    level: "warning",
    escalatesAfterMs: TWENTY_FOUR_HOURS_MS,
    audience: "all",
    scopeKind: "user",
    deduplicates: true,
  },
  {
    kind: "user_email_changed",
    level: "warning",
    escalatesAfterMs: TWENTY_FOUR_HOURS_MS,
    audience: "all",
    scopeKind: "user",
    deduplicates: true,
  },
  {
    kind: "backoffice_sign_in_lockout",
    level: "warning",
    escalatesAfterMs: TWENTY_FOUR_HOURS_MS,
    audience: "all",
    scopeKind: "sourceAddress",
    deduplicates: true,
  },
  {
    kind: "user_access_increased",
    level: "critical",
    escalatesAfterMs: null,
    audience: "all",
    scopeKind: "user",
    deduplicates: false,
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
