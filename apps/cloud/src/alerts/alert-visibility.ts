import type { OpenSession } from "../session/open-session.js";
import type { AlertAudience } from "./alert-kind-catalog.js";

/**
 * Whether `session` holds enough to see any alert at all: an Administrator, a `view_all_alerts`
 * holder, or a `view_branch_alerts` holder, matching the coarse gate `GET /alerts` and `GET
 * /alerts/:id` enforce before filtering by audience. A session with neither permission sees
 * nothing, whatever it asks for.
 */
export function canSeeAnyAlerts(session: OpenSession): boolean {
  return (
    session.isAdministrator ||
    session.permissionKeys.includes("view_branch_alerts") ||
    session.permissionKeys.includes("view_all_alerts")
  );
}

/**
 * Whether `session` holds `view_all_alerts` (an Administrator always does too), the permission
 * that shows every alert regardless of audience.
 */
export function canSeeAllAlerts(session: OpenSession): boolean {
  return session.isAdministrator || session.permissionKeys.includes("view_all_alerts");
}

export interface AlertVisibilityScope {
  audience: AlertAudience;
  locationId: string | null;
}

/**
 * Audience is decided by permission, never by role name: `view_all_alerts` sees every alert;
 * `view_branch_alerts` sees only a Local one scoped to the viewer's own branch, never an All one
 * and never a Local one of another branch.
 */
export function canSeeAlert(session: OpenSession, alert: AlertVisibilityScope): boolean {
  if (canSeeAllAlerts(session)) {
    return true;
  }
  return (
    alert.audience === "local" &&
    session.permissionKeys.includes("view_branch_alerts") &&
    alert.locationId === session.locationId
  );
}
