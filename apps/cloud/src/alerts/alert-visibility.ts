import { and, eq, inArray, or, type SQL, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { alerts, rolePermissions, roles, users } from "../db/schema.js";
import type { AlertAudience } from "./alert-kind-catalog.js";

/** Sees every alert regardless of audience or branch. */
export const VIEW_ALL_ALERTS_PERMISSION = "view_all_alerts";
/** Sees only a Local alert of the holder's own branch, never an All one or another branch's. */
export const VIEW_BRANCH_ALERTS_PERMISSION = "view_branch_alerts";

export interface AlertAudienceAccess {
  isAdministrator: boolean;
  permissionKeys: readonly string[];
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

export interface AlertViewerAccess extends AlertAudienceAccess {
  /** The signed-in viewer's own branch (every session has exactly one, see `OpenSession`). */
  locationId: string;
}

/**
 * The one place the audience rule is defined, expressed as SQL so both directions that need it
 * share it instead of each keeping its own copy:
 *
 * - This function filters the `alerts` table down to what `access` can see: the list route's own
 *   filter (`alerts-list-route.ts`) and `findAlertById`'s own visibility check (`alert-read-route.ts`,
 *   shared by `alert-close-route.ts`) both call it, instead of fetching a row unconditionally and
 *   checking it in memory.
 * - `visibleToUsersCondition` below is the same rule's other direction: filtering the `users` table
 *   down to who can see a newly opened alert (`recipientsFor`, `open-alert.ts`).
 *
 * An Administrator or a `view_all_alerts` holder sees every alert; a `view_branch_alerts` holder
 * sees only a Local one of their own branch, never an All one and never another branch's Local one;
 * a viewer holding neither sees nothing at all, whatever it asks for — the same case
 * `canSeeAnyAlerts` gates at the route entry, but this stays correct standalone rather than relying
 * on every caller to have checked that gate first (`alert-close-route.ts`'s own gate is a different
 * permission, `dismiss_alerts_manually`, so it does not).
 */
export function visibleAlertsCondition(access: AlertViewerAccess): SQL | undefined {
  if (canSeeAllAlerts(access)) {
    return undefined;
  }
  if (!access.permissionKeys.includes(VIEW_BRANCH_ALERTS_PERMISSION)) {
    return sql`false`;
  }
  return and(eq(alerts.audience, "local"), eq(alerts.locationId, access.locationId));
}

/**
 * The same audience rule's other direction: the SQL condition selecting every active user (already
 * joined to `userRoles`/`roles` by the caller) who can see an alert of `scope.audience`/
 * `scope.locationId` the moment it opens.
 */
export function visibleToUsersCondition<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  scope: { audience: AlertAudience; locationId: string | undefined },
): SQL {
  const viewAllRoleIds = tx
    .select({ roleId: rolePermissions.roleId })
    .from(rolePermissions)
    .where(eq(rolePermissions.permissionKey, VIEW_ALL_ALERTS_PERMISSION));
  const viewLocalRoleIds = tx
    .select({ roleId: rolePermissions.roleId })
    .from(rolePermissions)
    .where(eq(rolePermissions.permissionKey, VIEW_BRANCH_ALERTS_PERMISSION));

  const localVisibility =
    scope.audience === "local" && scope.locationId !== undefined
      ? and(eq(users.locationId, scope.locationId), inArray(roles.id, viewLocalRoleIds))
      : undefined;

  // `or` never returns undefined here: the first argument alone always yields a defined SQL node.
  return or(
    eq(roles.isAdministrator, true),
    inArray(roles.id, viewAllRoleIds),
    localVisibility,
  ) as SQL;
}
