import type {
  BranchUserActiveScope,
  BranchUserFacts,
  BranchUsers,
} from "@purosur/domain/access/use-cases";
import { and, asc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { passkeys, rolePermissions, roles, userRoles, users } from "../platform/db/schema.js";

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

class DrizzleBranchUsers<TQueryResult extends PgQueryResultHKT> implements BranchUsers {
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  private selectBranchUsers() {
    return this.db
      .select(BRANCH_USER_SELECTION)
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .leftJoin(passkeys, eq(passkeys.userId, users.id));
  }

  branchUsers(locationId: string, activeScope: BranchUserActiveScope): Promise<BranchUserFacts[]> {
    return this.selectBranchUsers()
      .where(and(eq(users.locationId, locationId), activeScopeCondition(activeScope)))
      .groupBy(...BRANCH_USER_GROUP_BY)
      .orderBy(asc(users.firstName));
  }

  async branchUser(
    locationId: string,
    userId: string,
    activeScope: BranchUserActiveScope,
  ): Promise<BranchUserFacts | undefined> {
    const [row] = await this.selectBranchUsers()
      .where(
        and(
          eq(users.id, userId),
          eq(users.locationId, locationId),
          activeScopeCondition(activeScope),
        ),
      )
      .groupBy(...BRANCH_USER_GROUP_BY)
      .limit(1);
    return row;
  }

  async branchUserWithEmail(
    locationId: string,
    email: string,
    activeScope: BranchUserActiveScope,
  ): Promise<BranchUserFacts | undefined> {
    const [row] = await this.selectBranchUsers()
      .where(
        and(
          eq(users.email, email),
          eq(users.locationId, locationId),
          activeScopeCondition(activeScope),
        ),
      )
      .groupBy(...BRANCH_USER_GROUP_BY)
      .limit(1);
    return row;
  }

  async activeAdministratorCount(locationId: string): Promise<number> {
    const [row] = await this.db
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

  async activeUserPermissionKeys(locationId: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ permissionKey: rolePermissions.permissionKey })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
      .where(and(eq(users.locationId, locationId), eq(users.active, true)));
    return rows.map((row) => row.permissionKey);
  }
}

export function drizzleBranchUsers<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
): BranchUsers {
  return new DrizzleBranchUsers(db);
}
