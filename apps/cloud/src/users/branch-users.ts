import { and, asc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { roles, userRoles, users } from "../db/schema.js";

export interface BranchUserRow {
  id: string;
  firstName: string;
  email: string;
  roleId: string;
  roleName: string | null;
  roleIsAdministrator: boolean;
}

export interface BranchUserWire {
  id: string;
  first_name: string;
  email: string;
  role: { id: string; is_administrator: boolean; name: string | null };
}

export function toBranchUserWire(row: BranchUserRow): BranchUserWire {
  return {
    id: row.id,
    first_name: row.firstName,
    email: row.email,
    role: { id: row.roleId, is_administrator: row.roleIsAdministrator, name: row.roleName },
  };
}

const BRANCH_USER_SELECTION = {
  id: users.id,
  firstName: users.firstName,
  email: users.email,
  roleId: roles.id,
  roleName: roles.name,
  roleIsAdministrator: roles.isAdministrator,
};

/**
 * Lists every user of `locationId`, ordered by first name, with the role each one holds. A user
 * created outside `createFirstAdministrator`/the (future) user-creation route without a
 * `user_roles` row is excluded by the inner join, the same way it would be invisible to any other
 * branch-scoped read.
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
    .where(eq(users.locationId, locationId))
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
    .where(and(eq(users.id, userId), eq(users.locationId, locationId)))
    .limit(1);
  return row;
}
