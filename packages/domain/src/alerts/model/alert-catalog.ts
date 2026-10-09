const ALERT_KIND_LIST = [
  "backoffice_passkey_changed",
  "backoffice_recovery_requested",
  "user_email_changed",
  "backoffice_sign_in_lockout",
  "user_access_increased",
  "register_enrolled",
  "events_quarantined",
  "event_invariant_violated",
  "arca_certificate_expiring",
  "update_required",
  "register_silent",
] as const;

export type AlertKind = (typeof ALERT_KIND_LIST)[number];

export const ALERT_KINDS: readonly AlertKind[] = ALERT_KIND_LIST;

const ALERT_KIND_SET: ReadonlySet<string> = new Set(ALERT_KIND_LIST);

export function isAlertKind(value: unknown): value is AlertKind {
  return typeof value === "string" && ALERT_KIND_SET.has(value);
}

export const ALERT_LEVELS = ["informational", "warning", "critical"] as const;

export type AlertLevel = (typeof ALERT_LEVELS)[number];

const ALERT_LEVEL_SET: ReadonlySet<string> = new Set(ALERT_LEVELS);

export function isAlertLevel(value: unknown): value is AlertLevel {
  return typeof value === "string" && ALERT_LEVEL_SET.has(value);
}

// Who can see an alert: every alert-view permission holder ("all"), or only a branch's own
// `view_branch_alerts` holders ("local").
export const ALERT_AUDIENCES = ["local", "all"] as const;

export type AlertAudience = (typeof ALERT_AUDIENCES)[number];
