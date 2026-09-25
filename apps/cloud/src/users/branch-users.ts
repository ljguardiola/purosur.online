import { and, asc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { passkeys, roles, userRoles, users } from "../db/schema.js";

export interface BranchUserRow {
  id: string;
  firstName: string;
  email: string;
  version: number;
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
  role: { id: string; is_administrator: boolean; name: string | null };
  passkey_count: number;
  is_last_active_administrator: boolean;
}

export function toBranchUserWire(row: BranchUserRow): BranchUserWire {
  return {
    id: row.id,
    first_name: row.firstName,
    email: row.email,
    version: row.version,
    role: { id: row.roleId, is_administrator: row.roleIsAdministrator, name: row.roleName },
    passkey_count: row.passkeyCount,
    is_last_active_administrator: row.isLastActiveAdministrator,
  };
}

const BRANCH_USER_SELECTION = {
  id: users.id,
  firstName: users.firstName,
  email: users.email,
  version: users.version,
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
 * Lists every active user of `locationId`, ordered by first name, with the role each one holds and
 * how many passkeys they have registered. A user created outside
 * `createFirstAdministrator`/`POST /users` without a `user_roles` row is excluded by the inner
 * join, the same way it would be invisible to any other branch-scoped read. A deactivated user is
 * excluded the same way: never deleted, but invisible here so every caller (list, detail, and
 * every user-mutation target lookup) treats it as gone, the same 404 a missing user gets.
 */
export async function listBranchUsers<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  locationId: string,
): Promise<BranchUserRow[]> {
  const rows = await db
    .select(BRANCH_USER_SELECTION)
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .leftJoin(passkeys, eq(passkeys.userId, users.id))
    .where(and(eq(users.locationId, locationId), eq(users.active, true)))
    .groupBy(...BRANCH_USER_GROUP_BY)
    .orderBy(asc(users.firstName));
  // Every row here is already one of this branch's active users, so counting the Administrators
  // among them is counting every active Administrator this branch has, with no extra query.
  const activeAdministratorCount = rows.filter((row) => row.roleIsAdministrator).length;
  return withLastActiveAdministratorFlag(rows, activeAdministratorCount);
}

/**
 * Finds `userId` only when it belongs to `locationId` and is still active; otherwise `undefined`,
 * same as a missing id (see `listBranchUsers` for why a deactivated user is excluded).
 */
export async function findBranchUser<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  locationId: string,
  userId: string,
): Promise<BranchUserRow | undefined> {
  const [row] = await db
    .select(BRANCH_USER_SELECTION)
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .leftJoin(passkeys, eq(passkeys.userId, users.id))
    .where(and(eq(users.id, userId), eq(users.locationId, locationId), eq(users.active, true)))
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
