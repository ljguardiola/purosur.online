import { and, asc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { passkeys, roles, userRoles, users } from "../db/schema.js";
import type { OpenSession } from "../session/open-session.js";

/**
 * Whether `session` may see a deactivated branch user at all: an Administrator, or a holder of
 * `reactivate_users`. Shared by the Users list/detail (which then also include the `active` field
 * and a deactivated user) and user creation (which then answers a deactivated email conflict with
 * that user's id instead of the plain `email_taken` everyone else gets).
 */
export function canReactivateUsers(
  session: Pick<OpenSession, "isAdministrator" | "permissionKeys">,
): boolean {
  return session.isAdministrator || session.permissionKeys.includes("reactivate_users");
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
  /** True only for the one active user, in this branch, who currently holds the Administrator
   * role while no one else does: the backoffice locks their role field on this. */
  isLastActiveAdministrator: boolean;
}

export interface BranchUserWire {
  id: string;
  first_name: string;
  email: string;
  version: number;
  /** Only present when the caller may see a deactivated user (`toBranchUserWire`'s
   * `includeActive`): everyone else's responses never mention it, active or not. */
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

/**
 * Which of a branch's users a lookup considers: `"active"` (the default, and the only scope every
 * user-mutation lookup other than reactivation itself uses), `"inactive"` (reactivation's own
 * target lookup), or `"any"` (the Users list/detail, for a caller who may see a deactivated user).
 */
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

/** Stamps `isLastActiveAdministrator` on every row from a count of active Administrator holders
 * already known for their branch, instead of each row computing its own subquery. */
function withLastActiveAdministratorFlag(
  rows: RawBranchUserRow[],
  activeAdministratorCount: number,
): BranchUserRow[] {
  return rows.map((row) => ({
    ...row,
    isLastActiveAdministrator: row.roleIsAdministrator && activeAdministratorCount === 1,
  }));
}

/**
 * Lists `locationId`'s users in `activeScope` (active users only, by default), ordered by first
 * name, with the role each one holds and how many passkeys they have registered. A user created
 * outside `createFirstAdministrator`/`POST /users` without a `user_roles` row is excluded by the
 * inner join, the same way it would be invisible to any other branch-scoped read. Under the
 * default `"active"` scope, a deactivated user is excluded the same way: never deleted, but
 * invisible here so every caller (every user-mutation target lookup other than reactivation's own)
 * treats it as gone, the same 404 a missing user gets. Only the Users list passes `"any"`, and only
 * for a caller who may see a deactivated user.
 */
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
  // A deactivated user, when the scope includes one, is never counted as an active Administrator
  // (the deactivation route never leaves one deactivated in that role, but this stays correct even
  // so), so this is still every active Administrator this branch has, with no extra query.
  const activeAdministratorCount = rows.filter(
    (row) => row.roleIsAdministrator && row.active,
  ).length;
  return withLastActiveAdministratorFlag(rows, activeAdministratorCount);
}

/**
 * Finds `userId` only when it belongs to `locationId` and matches `activeScope` (active users only,
 * by default); otherwise `undefined`, same as a missing id (see `listBranchUsers` for why a
 * deactivated user is excluded under the default scope). Reactivation's own target lookup passes
 * `"inactive"`; the Users detail passes `"any"` for a caller who may see a deactivated user.
 */
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

/** How many active users of `locationId` currently hold the Administrator role. */
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
