const ALERT_KIND_LIST = [
  "backoffice_passkey_changed",
  "backoffice_recovery_requested",
  "user_email_changed",
  "backoffice_sign_in_lockout",
] as const;

export type AlertKind = (typeof ALERT_KIND_LIST)[number];

export const ALERT_KINDS: readonly AlertKind[] = ALERT_KIND_LIST;

const ALERT_KIND_SET: ReadonlySet<string> = new Set(ALERT_KIND_LIST);

export function isAlertKind(value: unknown): value is AlertKind {
  return typeof value === "string" && ALERT_KIND_SET.has(value);
}

export const ALERT_LEVELS = ["informational", "warning", "critical"] as const;

export type AlertLevel = (typeof ALERT_LEVELS)[number];

// Who can see an alert: every alert-view permission holder ("all"), or only a branch's own
// `view_branch_alerts` holders ("local").
export const ALERT_AUDIENCES = ["local", "all"] as const;

export type AlertAudience = (typeof ALERT_AUDIENCES)[number];
