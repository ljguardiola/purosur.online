import { ALERT_VIEW_PERMISSION_KEYS, type PermissionKey } from "@purosur/contracts";

const [BRANCH_ALERTS_VIEW, ALL_ALERTS_VIEW] = ALERT_VIEW_PERMISSION_KEYS;

/**
 * A role holds at most one alert view, yet the Administrator role reports the whole catalog, both
 * alert views included. Keeping only the broader one lets a form pre-filled from such a list show
 * and save the same single alert view.
 */
export function withOneAlertView(keys: Iterable<PermissionKey>): Set<PermissionKey> {
  const next = new Set(keys);
  if (next.has(BRANCH_ALERTS_VIEW) && next.has(ALL_ALERTS_VIEW)) {
    next.delete(BRANCH_ALERTS_VIEW);
  }
  return next;
}
