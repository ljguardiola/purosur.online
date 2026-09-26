import type { OpenSession } from "../session/open-session.js";
import type { AlertAudience } from "./alert-kind-catalog.js";

/** Sees every alert regardless of audience or branch. */
export const VIEW_ALL_ALERTS_PERMISSION = "view_all_alerts";
/** Sees only a Local alert of the holder's own branch, never an All one or another branch's. */
export const VIEW_BRANCH_ALERTS_PERMISSION = "view_branch_alerts";

/**
 * The one place the audience rule is defined: an Administrator or a `view_all_alerts` holder can
 * see every alert; a `view_branch_alerts` holder can see only a Local one of their own branch,
 * never an All one and never a Local one of another branch. `recipientsFor` (`open-alert.ts`) and
 * the list route's own visibility filter (`alerts-list-route.ts`) both apply the same rule to a
 * batch of rows through SQL instead of this boolean form, but import these same permission keys
 * rather than keeping their own copies.
 */
export interface AlertAudienceAccess {
  isAdministrator: boolean;
  permissionKeys: readonly string[];
}

export interface AlertVisibilityScope {
  audience: AlertAudience;
  locationId: string | null;
}

/**
 * Whether `access` holds enough to see any alert at all: an Administrator, a `view_all_alerts`
 * holder, or a `view_branch_alerts` holder, matching the coarse gate `GET /alerts` and `GET
 * /alerts/:id` enforce before filtering by audience. Neither permission sees nothing, whatever it
 * asks for.
 */
export function canSeeAnyAlerts(access: AlertAudienceAccess): boolean {
  return (
    access.isAdministrator ||
    access.permissionKeys.includes(VIEW_BRANCH_ALERTS_PERMISSION) ||
    access.permissionKeys.includes(VIEW_ALL_ALERTS_PERMISSION)
  );
}

/**
 * Whether `access` holds `view_all_alerts` (an Administrator always does too), the permission
 * that shows every alert regardless of audience.
 */
export function canSeeAllAlerts(access: AlertAudienceAccess): boolean {
  return access.isAdministrator || access.permissionKeys.includes(VIEW_ALL_ALERTS_PERMISSION);
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
    session.permissionKeys.includes(VIEW_BRANCH_ALERTS_PERMISSION) &&
    alert.locationId === session.locationId
  );
}
