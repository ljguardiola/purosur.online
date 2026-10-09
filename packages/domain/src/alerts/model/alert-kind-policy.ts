import { ARCA_CERTIFICATE_EXPIRY_ESCALATION_MS } from "../../fiscal/index.js";
import {
  ALERT_KINDS,
  type AlertAudience,
  type AlertKind,
  type AlertLevel,
} from "./alert-catalog.js";

export type AlertScopeKind =
  | "user"
  | "sourceAddress"
  | "register"
  | "environment"
  | "event"
  | "pointOfSaleDocumentType";

type AlertEscalationRule =
  | { kind: "afterOpening"; delayMs: number }
  | { kind: "beforeDeadline"; leadMs: number };

export interface AlertKindPolicy {
  level: AlertLevel;
  escalation: AlertEscalationRule | null;
  audience: AlertAudience;
  scopeKind: AlertScopeKind;
  deduplicates: boolean;
  resolvesAfterStableClear: boolean;
}

export const ALERT_ESCALATION_DELAY_MS = 24 * 60 * 60 * 1000;

const AFTER_OPENING = { kind: "afterOpening", delayMs: ALERT_ESCALATION_DELAY_MS } as const;

const ALERT_KIND_POLICIES = {
  backoffice_passkey_changed: {
    level: "warning",
    escalation: AFTER_OPENING,
    audience: "all",
    scopeKind: "user",
    deduplicates: true,
    resolvesAfterStableClear: false,
  },
  backoffice_recovery_requested: {
    level: "warning",
    escalation: AFTER_OPENING,
    audience: "all",
    scopeKind: "user",
    deduplicates: true,
    resolvesAfterStableClear: false,
  },
  user_email_changed: {
    level: "warning",
    escalation: AFTER_OPENING,
    audience: "all",
    scopeKind: "user",
    deduplicates: true,
    resolvesAfterStableClear: false,
  },
  backoffice_sign_in_lockout: {
    level: "warning",
    escalation: AFTER_OPENING,
    audience: "all",
    scopeKind: "sourceAddress",
    deduplicates: true,
    resolvesAfterStableClear: false,
  },
  user_access_increased: {
    level: "critical",
    escalation: null,
    audience: "all",
    scopeKind: "user",
    deduplicates: false,
    resolvesAfterStableClear: false,
  },
  register_enrolled: {
    level: "warning",
    escalation: AFTER_OPENING,
    audience: "all",
    scopeKind: "register",
    deduplicates: false,
    resolvesAfterStableClear: false,
  },
  events_quarantined: {
    level: "warning",
    escalation: AFTER_OPENING,
    audience: "all",
    scopeKind: "event",
    deduplicates: true,
    resolvesAfterStableClear: false,
  },
  event_invariant_violated: {
    level: "warning",
    escalation: AFTER_OPENING,
    audience: "all",
    scopeKind: "event",
    deduplicates: true,
    resolvesAfterStableClear: false,
  },
  arca_certificate_expiring: {
    level: "warning",
    escalation: { kind: "beforeDeadline", leadMs: ARCA_CERTIFICATE_EXPIRY_ESCALATION_MS },
    audience: "all",
    scopeKind: "environment",
    deduplicates: true,
    resolvesAfterStableClear: false,
  },
  update_required: {
    level: "critical",
    escalation: null,
    audience: "all",
    scopeKind: "register",
    deduplicates: true,
    resolvesAfterStableClear: true,
  },
  register_silent: {
    level: "critical",
    escalation: null,
    audience: "local",
    scopeKind: "register",
    deduplicates: true,
    resolvesAfterStableClear: true,
  },
  sales_denied: {
    level: "critical",
    escalation: null,
    audience: "local",
    scopeKind: "register",
    deduplicates: true,
    resolvesAfterStableClear: true,
  },
  fiscal_rejected: {
    level: "critical",
    escalation: null,
    audience: "all",
    scopeKind: "pointOfSaleDocumentType",
    deduplicates: true,
    resolvesAfterStableClear: true,
  },
} as const satisfies Record<AlertKind, AlertKindPolicy>;

export function alertKindPolicy(kind: AlertKind): AlertKindPolicy {
  return ALERT_KIND_POLICIES[kind];
}

export function alertKindsWithScope(scopeKind: AlertScopeKind): AlertKind[] {
  return ALERT_KINDS.filter((kind) => ALERT_KIND_POLICIES[kind].scopeKind === scopeKind);
}
