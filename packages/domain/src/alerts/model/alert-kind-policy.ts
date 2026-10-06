import {
  ALERT_KINDS,
  type AlertAudience,
  type AlertKind,
  type AlertLevel,
} from "./alert-catalog.js";

export type AlertScopeKind = "user" | "sourceAddress" | "register";

export interface AlertKindPolicy {
  level: AlertLevel;
  escalatesAfterMs: number | null;
  audience: AlertAudience;
  scopeKind: AlertScopeKind;
  deduplicates: boolean;
}

export const ALERT_ESCALATION_DELAY_MS = 24 * 60 * 60 * 1000;

const ALERT_KIND_POLICIES = {
  backoffice_passkey_changed: {
    level: "warning",
    escalatesAfterMs: ALERT_ESCALATION_DELAY_MS,
    audience: "all",
    scopeKind: "user",
    deduplicates: true,
  },
  backoffice_recovery_requested: {
    level: "warning",
    escalatesAfterMs: ALERT_ESCALATION_DELAY_MS,
    audience: "all",
    scopeKind: "user",
    deduplicates: true,
  },
  user_email_changed: {
    level: "warning",
    escalatesAfterMs: ALERT_ESCALATION_DELAY_MS,
    audience: "all",
    scopeKind: "user",
    deduplicates: true,
  },
  backoffice_sign_in_lockout: {
    level: "warning",
    escalatesAfterMs: ALERT_ESCALATION_DELAY_MS,
    audience: "all",
    scopeKind: "sourceAddress",
    deduplicates: true,
  },
  user_access_increased: {
    level: "critical",
    escalatesAfterMs: null,
    audience: "all",
    scopeKind: "user",
    deduplicates: false,
  },
  register_enrolled: {
    level: "warning",
    escalatesAfterMs: ALERT_ESCALATION_DELAY_MS,
    audience: "all",
    scopeKind: "register",
    deduplicates: false,
  },
} as const satisfies Record<AlertKind, AlertKindPolicy>;

export function alertKindPolicy(kind: AlertKind): AlertKindPolicy {
  return ALERT_KIND_POLICIES[kind];
}

export function alertKindsWithScope(scopeKind: AlertScopeKind): AlertKind[] {
  return ALERT_KINDS.filter((kind) => ALERT_KIND_POLICIES[kind].scopeKind === scopeKind);
}
