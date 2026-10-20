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
  | "pointOfSaleDocumentType"
  | "pointOfSaleDocumentNumber"
  | "registerFortnight"
  | "refund"
  | "fiscalDocument"
  | "syncDevice"
  | "branch"
  | "pointOfSaleFortnight";

type AlertEscalationRule =
  | { kind: "afterOpening"; delayMs: number }
  | { kind: "afterSubjectOpening"; delayMs: number }
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
export const LATE_PAYMENT_REFUND_ESCALATION_DELAY_MS = 72 * 60 * 60 * 1000;
export const REFUND_TASK_ALERT_OPENING_DELAY_MS = 24 * 60 * 60 * 1000;
export const REFUND_TASK_ESCALATION_DELAY_MS = 72 * 60 * 60 * 1000;
export const FISCAL_UNKNOWN_ALERT_OPENING_DELAY_MS = 5 * 60 * 1000;
export const FISCAL_UNKNOWN_ESCALATION_DELAY_MS = 30 * 60 * 1000;
export const ARCA_CERTIFICATE_EXPIRY_ESCALATION_MS = 7 * 24 * 60 * 60 * 1000;

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
    scopeKind: "syncDevice",
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
  arca_wsaa_ticket_held: {
    level: "warning",
    escalation: null,
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
  offline_authorization_code_missing: {
    level: "informational",
    escalation: null,
    audience: "all",
    scopeKind: "registerFortnight",
    deduplicates: true,
    resolvesAfterStableClear: true,
  },
  late_payment_refund: {
    level: "warning",
    escalation: { kind: "afterOpening", delayMs: LATE_PAYMENT_REFUND_ESCALATION_DELAY_MS },
    audience: "local",
    scopeKind: "refund",
    deduplicates: true,
    resolvesAfterStableClear: false,
  },
  refund_task: {
    level: "warning",
    escalation: { kind: "afterSubjectOpening", delayMs: REFUND_TASK_ESCALATION_DELAY_MS },
    audience: "local",
    scopeKind: "refund",
    deduplicates: true,
    resolvesAfterStableClear: false,
  },
  fiscal_unknown: {
    level: "warning",
    escalation: { kind: "afterSubjectOpening", delayMs: FISCAL_UNKNOWN_ESCALATION_DELAY_MS },
    audience: "all",
    scopeKind: "fiscalDocument",
    deduplicates: true,
    resolvesAfterStableClear: false,
  },
  fiscal_emission_stopped: {
    level: "critical",
    escalation: null,
    audience: "local",
    scopeKind: "register",
    deduplicates: true,
    resolvesAfterStableClear: true,
  },
  clock_drift: {
    level: "critical",
    escalation: null,
    audience: "local",
    scopeKind: "register",
    deduplicates: true,
    resolvesAfterStableClear: true,
  },
  outbox_chain_broken: {
    level: "warning",
    escalation: AFTER_OPENING,
    audience: "all",
    scopeKind: "syncDevice",
    deduplicates: false,
    resolvesAfterStableClear: false,
  },
  lots_expiring: {
    level: "informational",
    escalation: null,
    audience: "local",
    scopeKind: "branch",
    deduplicates: true,
    resolvesAfterStableClear: true,
  },
  offsite_dump_unverified: {
    level: "critical",
    escalation: null,
    audience: "all",
    scopeKind: "environment",
    deduplicates: true,
    resolvesAfterStableClear: true,
  },
  fortnight_report_pending: {
    level: "warning",
    escalation: null,
    audience: "all",
    scopeKind: "pointOfSaleFortnight",
    deduplicates: true,
    resolvesAfterStableClear: true,
  },
  fortnight_report_overdue: {
    level: "critical",
    escalation: null,
    audience: "all",
    scopeKind: "pointOfSaleFortnight",
    deduplicates: true,
    resolvesAfterStableClear: false,
  },
  external_billing: {
    level: "critical",
    escalation: null,
    audience: "all",
    scopeKind: "pointOfSaleDocumentNumber",
    deduplicates: true,
    resolvesAfterStableClear: false,
  },
  clock_corrected: {
    level: "critical",
    escalation: null,
    audience: "all",
    scopeKind: "register",
    deduplicates: false,
    resolvesAfterStableClear: false,
  },
  fortnight_report_needs_regularization: {
    level: "critical",
    escalation: null,
    audience: "all",
    scopeKind: "pointOfSaleFortnight",
    deduplicates: true,
    resolvesAfterStableClear: false,
  },
  fortnight_report_owed_elsewhere: {
    level: "critical",
    escalation: null,
    audience: "all",
    scopeKind: "pointOfSaleFortnight",
    deduplicates: true,
    resolvesAfterStableClear: true,
  },
  register_backup_overdue: {
    level: "critical",
    escalation: null,
    audience: "all",
    scopeKind: "register",
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

export const ALERT_CLOSINGS = [
  "by_itself",
  "with_its_refund",
  "when_its_document_is_resolved",
  "when_its_events_are_released",
  "by_hand",
] as const;
export type AlertClosing = (typeof ALERT_CLOSINGS)[number];

export function alertClosing(kind: AlertKind): AlertClosing {
  const policy = ALERT_KIND_POLICIES[kind];
  if (policy.resolvesAfterStableClear) {
    return "by_itself";
  }
  if (policy.scopeKind === "fiscalDocument") {
    return "when_its_document_is_resolved";
  }
  if (kind === "events_quarantined") {
    return "when_its_events_are_released";
  }
  return policy.scopeKind === "refund" ? "with_its_refund" : "by_hand";
}
