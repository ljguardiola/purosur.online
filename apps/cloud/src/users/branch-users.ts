import { and, asc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { passkeys, roles, userRoles, users } from "../db/schema.js";
import type { OpenSession } from "../session/open-session.js";
import { isAccessGranted, permissionAccess } from "../session/route-access.js";

// Whether `session` may see a deactivated branch user at all: an Administrator, or a holder of
// `reactivate_users`.
export function canReactivateUsers(
  session: Pick<OpenSession, "isAdministrator" | "permissionKeys">,
): boolean {
  return isAccessGranted(permissionAccess("reactivate_users"), session);
}

export interface BranchUserRow {
  id: string;
  firstName: string;
  email: string;
  version: number;
  active: boolean;
  roleId: string;
  roleName: string | null;
  roleIsAdministrator: boolean;
  passkeyCount: number;
  // True only for the branch's one active Administrator; the backoffice locks their role field
  // on this.
  isLastActiveAdministrator: boolean;
}

export interface BranchUserWire {
  id: string;
  first_name: string;
  email: string;
  version: number;
  // Only present when the caller may see a deactivated user; everyone else's responses never
  // mention it, active or not.
  active?: boolean;
  role: { id: string; is_administrator: boolean; name: string | null };
  passkey_count: number;
  is_last_active_administrator: boolean;
}

export function toBranchUserWire(
  row: BranchUserRow,
  options: { includeActive?: boolean } = {},
): BranchUserWire {
  return {
    id: row.id,
    first_name: row.firstName,
    email: row.email,
    version: row.version,
    ...(options.includeActive ? { active: row.active } : {}),
    role: { id: row.roleId, is_administrator: row.roleIsAdministrator, name: row.roleName },
    passkey_count: row.passkeyCount,
    is_last_active_administrator: row.isLastActiveAdministrator,
  };
}

export type BranchUserActiveScope = "active" | "inactive" | "any";

function activeScopeCondition(scope: BranchUserActiveScope) {
  switch (scope) {
    case "active":
      return eq(users.active, true);
    case "inactive":
      return eq(users.active, false);
    case "any":
      return undefined;
  }
}

const BRANCH_USER_SELECTION = {
  id: users.id,
  firstName: users.firstName,
  email: users.email,
  version: users.version,
  active: users.active,
  roleId: roles.id,
  roleName: roles.name,
  roleIsAdministrator: roles.isAdministrator,
  // Counted in the same query (left-joined, then grouped) instead of a follow-up query per user,
  // so listing a branch's users never runs N+1 passkey lookups.
  passkeyCount: sql<number>`count(${passkeys.id})::int`.as("passkey_count"),
};

const BRANCH_USER_GROUP_BY = [
  users.id,
  users.firstName,
  users.email,
  users.version,
  users.active,
  roles.id,
  roles.name,
  roles.isAdministrator,
];

type RawBranchUserRow = Omit<BranchUserRow, "isLastActiveAdministrator">;

// Stamps the flag from a count already known for the branch, instead of a subquery per row.
function withLastActiveAdministratorFlag(
  rows: RawBranchUserRow[],
  activeAdministratorCount: number,
): BranchUserRow[] {
  return rows.map((row) => ({
    ...row,
    isLastActiveAdministrator: row.roleIsAdministrator && activeAdministratorCount === 1,
  }));
}

// The inner join silently excludes a user with no user_roles row; under the default "active"
// scope it also excludes a deactivated user (never deleted, just invisible here).
export async function listBranchUsers<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  locationId: string,
  options: { activeScope?: BranchUserActiveScope } = {},
): Promise<BranchUserRow[]> {
  const activeScope = options.activeScope ?? "active";
  const rows = await db
    .select(BRANCH_USER_SELECTION)
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .leftJoin(passkeys, eq(passkeys.userId, users.id))
    .where(and(eq(users.locationId, locationId), activeScopeCondition(activeScope)))
    .groupBy(...BRANCH_USER_GROUP_BY)
    .orderBy(asc(users.firstName));
  // A deactivated user in the rows is never counted here (filtered by `row.active`), so this
  // stays correct even when the scope includes one.
  const activeAdministratorCount = rows.filter(
    (row) => row.roleIsAdministrator && row.active,
  ).length;
  return withLastActiveAdministratorFlag(rows, activeAdministratorCount);
}

export async function findBranchUser<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  locationId: string,
  userId: string,
  options: { activeScope?: BranchUserActiveScope } = {},
): Promise<BranchUserRow | undefined> {
  const activeScope = options.activeScope ?? "active";
  const [row] = await db
    .select(BRANCH_USER_SELECTION)
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .leftJoin(passkeys, eq(passkeys.userId, users.id))
    .where(
      and(
        eq(users.id, userId),
        eq(users.locationId, locationId),
        activeScopeCondition(activeScope),
      ),
    )
    .groupBy(...BRANCH_USER_GROUP_BY)
    .limit(1);
  if (!row) {
    return undefined;
  }
  const activeAdministratorCount = await countActiveAdministrators(db, locationId);
  return withLastActiveAdministratorFlag([row], activeAdministratorCount)[0];
}

async function countActiveAdministrators<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  locationId: string,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(
      and(
        eq(users.locationId, locationId),
        eq(users.active, true),
        eq(roles.isAdministrator, true),
      ),
    );
  return row?.count ?? 0;
}
