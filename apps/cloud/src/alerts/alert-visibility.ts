import type { AlertAudience } from "@purosur/contracts";
import { and, eq, inArray, or, type SQL, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { alerts, rolePermissions, roles, users } from "../db/schema.js";

/** Sees every alert regardless of audience or branch. */
export const VIEW_ALL_ALERTS_PERMISSION = "view_all_alerts";
/** Sees only a Local alert of the holder's own branch, never an All one or another branch's. */
export const VIEW_BRANCH_ALERTS_PERMISSION = "view_branch_alerts";

export interface AlertAudienceAccess {
  isAdministrator: boolean;
  permissionKeys: readonly string[];
}

export function canSeeAnyAlerts(access: AlertAudienceAccess): boolean {
  return (
    access.isAdministrator ||
    access.permissionKeys.includes(VIEW_BRANCH_ALERTS_PERMISSION) ||
    access.permissionKeys.includes(VIEW_ALL_ALERTS_PERMISSION)
  );
}

export function canSeeAllAlerts(access: AlertAudienceAccess): boolean {
  return access.isAdministrator || access.permissionKeys.includes(VIEW_ALL_ALERTS_PERMISSION);
}

export interface AlertViewerAccess extends AlertAudienceAccess {
  /** Every session has exactly one branch. */
  locationId: string;
}

export function visibleAlertsCondition(access: AlertViewerAccess): SQL | undefined {
  if (canSeeAllAlerts(access)) {
    return undefined;
  }
  if (!access.permissionKeys.includes(VIEW_BRANCH_ALERTS_PERMISSION)) {
    return sql`false`;
  }
  return and(eq(alerts.audience, "local"), eq(alerts.locationId, access.locationId));
}

// Assumes the caller already joined `users` to `userRoles`/`roles`.
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
