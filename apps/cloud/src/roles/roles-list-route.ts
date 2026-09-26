import { PERMISSION_KEYS } from "@purosur/contracts";
import { asc, desc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { rolePermissions, roles, userRoles, users } from "../db/schema.js";
import { checkRequestIsSameOrigin } from "../session/open-session.js";
import {
  ADMINISTRATOR_ACCESS,
  originGuard,
  registerRouteAccess,
  routeSessionSource,
} from "../session/route-access.js";

export interface RolesRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  /** Injected in tests so idle/absolute expiry are checked against a deterministic clock. */
  now?: () => Date;
}

export interface RoleSummaryRow {
  id: string;
  name: string | null;
  isAdministrator: boolean;
  permissionKeys: string[];
  userCount: number;
}

export interface RoleSummaryWire {
  id: string;
  name: string | null;
  is_administrator: boolean;
  permissions: string[];
  user_count: number;
}

export function toRoleSummaryWire(row: RoleSummaryRow): RoleSummaryWire {
  return {
    id: row.id,
    name: row.name,
    is_administrator: row.isAdministrator,
    permissions: row.permissionKeys,
    user_count: row.userCount,
  };
}

/**
 * Lists every role, Administrator first (then by name), counting every user who holds each role
 * across every branch: roles aren't scoped to a branch (`db/schema.ts`), so its people aren't
 * either. The Administrator row never has stored `role_permissions` rows, so it always reports the
 * full permission catalog instead of whatever (nothing) is in that table for it.
 */
export async function listRoles<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
): Promise<RoleSummaryRow[]> {
  const roleRows = await db
    .select({ id: roles.id, name: roles.name, isAdministrator: roles.isAdministrator })
    .from(roles)
    .orderBy(desc(roles.isAdministrator), asc(roles.name));

  const permissionRows = await db
    .select({ roleId: rolePermissions.roleId, permissionKey: rolePermissions.permissionKey })
    .from(rolePermissions);
  const storedKeysByRole = new Map<string, Set<string>>();
  for (const row of permissionRows) {
    const current = storedKeysByRole.get(row.roleId) ?? new Set<string>();
    current.add(row.permissionKey);
    storedKeysByRole.set(row.roleId, current);
  }
  const catalogOrderedKeys = (roleId: string): string[] => {
    const stored = storedKeysByRole.get(roleId);
    return stored ? PERMISSION_KEYS.filter((key) => stored.has(key)) : [];
  };

  const userCountRows = await db
    .select({ roleId: userRoles.roleId, count: sql<number>`count(*)::int` })
    .from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(eq(users.active, true))
    .groupBy(userRoles.roleId);
  const userCountByRole = new Map(userCountRows.map((row) => [row.roleId, row.count]));

  return roleRows.map((role) => ({
    id: role.id,
    name: role.name,
    isAdministrator: role.isAdministrator,
    permissionKeys: role.isAdministrator ? [...PERMISSION_KEYS] : catalogOrderedKeys(role.id),
    userCount: userCountByRole.get(role.id) ?? 0,
  }));
}

/** Registers `GET /roles`: Administrator-only, same open-session shape `GET /users` uses. */
export function registerRolesListRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: RolesRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.get(
    "/roles",
    {
      preHandler: originGuard((request, reply) =>
        checkRequestIsSameOrigin(request, reply, options.backofficeOrigin),
      ),
      config: { access: ADMINISTRATOR_ACCESS, sessionSource },
    },
    async (_request, reply) => {
      const rows = await listRoles(options.db);
      await reply.code(200).send(rows.map(toRoleSummaryWire));
    },
  );
}
