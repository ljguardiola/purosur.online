import type { AlertAudience } from "@purosur/contracts";
import { and, eq, inArray, or, type SQL, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { alerts, rolePermissions, roles, users } from "../platform/db/schema.js";

const VIEW_ALL_ALERTS_PERMISSION = "view_all_alerts";
const VIEW_BRANCH_ALERTS_PERMISSION = "view_branch_alerts";

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

function canSeeAllAlerts(access: AlertAudienceAccess): boolean {
  return access.isAdministrator || access.permissionKeys.includes(VIEW_ALL_ALERTS_PERMISSION);
}

export interface AlertViewerAccess extends AlertAudienceAccess {
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

export function visibleToUsersJoinedWithRolesCondition<TQueryResult extends PgQueryResultHKT>(
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

  // Drizzle types `or` as possibly undefined; a defined first argument makes it always defined.
  return or(
    eq(roles.isAdministrator, true),
    inArray(roles.id, viewAllRoleIds),
    localVisibility,
  ) as SQL;
}
