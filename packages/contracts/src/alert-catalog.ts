// The security-alert kinds, levels and audiences the cloud and the backoffice both need to agree
// on: the cloud opens and escalates alerts of these kinds, and the backoffice renders their icon,
// title and level without inventing its own copy of what kinds or levels exist.
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

export type AlertLevel = "informational" | "warning" | "critical";

/** Who can see an alert: every alert-view permission holder ("all"), or only a branch's own
 * `view_branch_alerts` holders ("local"). */
export type AlertAudience = "local" | "all";
