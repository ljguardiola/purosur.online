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
}

export interface BranchUserWire {
  id: string;
  first_name: string;
  email: string;
  version: number;
  role: { id: string; is_administrator: boolean; name: string | null };
  passkey_count: number;
}

export function toBranchUserWire(row: BranchUserRow): BranchUserWire {
  return {
    id: row.id,
    first_name: row.firstName,
    email: row.email,
    version: row.version,
    role: { id: row.roleId, is_administrator: row.roleIsAdministrator, name: row.roleName },
    passkey_count: row.passkeyCount,
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

/**
 * Lists every user of `locationId`, ordered by first name, with the role each one holds and how
 * many passkeys they have registered. A user created outside
 * `createFirstAdministrator`/`POST /users` without a `user_roles` row is excluded by the inner
 * join, the same way it would be invisible to any other branch-scoped read.
 */
export async function listBranchUsers<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  locationId: string,
): Promise<BranchUserRow[]> {
  return db
    .select(BRANCH_USER_SELECTION)
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .leftJoin(passkeys, eq(passkeys.userId, users.id))
    .where(eq(users.locationId, locationId))
    .groupBy(...BRANCH_USER_GROUP_BY)
    .orderBy(asc(users.firstName));
}

/** Finds `userId` only when it belongs to `locationId`; otherwise `undefined`, same as a missing id. */
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
    .where(and(eq(users.id, userId), eq(users.locationId, locationId)))
    .groupBy(...BRANCH_USER_GROUP_BY)
    .limit(1);
  return row;
}
