import type {
  RoleDirectory,
  RoleHolder,
  RoleListing,
  StoredRole,
} from "@purosur/domain/permissions/use-cases";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { rolePermissions, roles, userRoles, users } from "../platform/db/schema.js";

class DrizzleRoleDirectory<TQueryResult extends PgQueryResultHKT> implements RoleDirectory {
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async roles(): Promise<RoleListing[]> {
    const roleRows = await this.db
      .select({ id: roles.id, name: roles.name, isAdministrator: roles.isAdministrator })
      .from(roles)
      .orderBy(desc(roles.isAdministrator), asc(roles.name));

    const permissionRows = await this.db
      .select({ roleId: rolePermissions.roleId, permissionKey: rolePermissions.permissionKey })
      .from(rolePermissions);
    const storedKeysByRole = new Map<string, string[]>();
    for (const row of permissionRows) {
      storedKeysByRole.set(row.roleId, [
        ...(storedKeysByRole.get(row.roleId) ?? []),
        row.permissionKey,
      ]);
    }

    const holderCountRows = await this.db
      .select({ roleId: userRoles.roleId, count: sql<number>`count(*)::int` })
      .from(userRoles)
      .innerJoin(users, eq(users.id, userRoles.userId))
      .where(eq(users.active, true))
      .groupBy(userRoles.roleId);
    const holderCountByRole = new Map(holderCountRows.map((row) => [row.roleId, row.count]));

    return roleRows.map((role) => ({
      ...role,
      storedPermissionKeys: storedKeysByRole.get(role.id) ?? [],
      activeHolderCount: holderCountByRole.get(role.id) ?? 0,
    }));
  }

  async role(roleId: string): Promise<StoredRole | undefined> {
    const [role] = await this.db
      .select({
        id: roles.id,
        name: roles.name,
        isAdministrator: roles.isAdministrator,
        version: roles.version,
      })
      .from(roles)
      .where(eq(roles.id, roleId));
    if (!role) {
      return undefined;
    }
    const permissionRows = await this.db
      .select({ permissionKey: rolePermissions.permissionKey })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, roleId));
    return { ...role, storedPermissionKeys: permissionRows.map((row) => row.permissionKey) };
  }

  activeRoleHolders(roleId: string): Promise<RoleHolder[]> {
    return this.db
      .select({ id: users.id, name: users.firstName })
      .from(userRoles)
      .innerJoin(users, eq(users.id, userRoles.userId))
      .where(and(eq(userRoles.roleId, roleId), eq(users.active, true)))
      .orderBy(asc(users.firstName), asc(users.id));
  }
}

export function drizzleRoleDirectory<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
): RoleDirectory {
  return new DrizzleRoleDirectory(db);
}
