import { asc, desc, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { rolePermissions, roles, userRoles } from "../db/schema.js";
import { checkRequestIsSameOrigin, requireOpenSession } from "../session/open-session.js";
import { FORBIDDEN_RESPONSE } from "../users/forbidden-response.js";
import { PERMISSION_KEYS } from "./permission-catalog.js";

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
 * Lists every role, Administrator first (then by name): the Administrator row never has stored
 * `role_permissions` rows, so it always reports the full permission catalog instead of whatever
 * (nothing) is in that table for it.
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
  const permissionKeysByRole = new Map<string, string[]>();
  for (const row of permissionRows) {
    const current = permissionKeysByRole.get(row.roleId) ?? [];
    current.push(row.permissionKey);
    permissionKeysByRole.set(row.roleId, current);
  }

  const userCountRows = await db
    .select({ roleId: userRoles.roleId, count: sql<number>`count(*)::int` })
    .from(userRoles)
    .groupBy(userRoles.roleId);
  const userCountByRole = new Map(userCountRows.map((row) => [row.roleId, row.count]));

  return roleRows.map((role) => ({
    id: role.id,
    name: role.name,
    isAdministrator: role.isAdministrator,
    permissionKeys: role.isAdministrator
      ? [...PERMISSION_KEYS]
      : (permissionKeysByRole.get(role.id) ?? []),
    userCount: userCountByRole.get(role.id) ?? 0,
  }));
}

/** Registers `GET /roles`: Administrator-only, same open-session shape `GET /users` uses. */
export function registerRolesListRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: RolesRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());

  app.get("/roles", async (request, reply) => {
    if (!checkRequestIsSameOrigin(request, reply, options.backofficeOrigin)) {
      return;
    }
    const checkedAt = now();
    const openSession = await requireOpenSession(request, reply, {
      db: options.db,
      now: checkedAt,
    });
    if (!openSession) {
      return;
    }
    if (!openSession.isAdministrator) {
      await reply.code(403).send(FORBIDDEN_RESPONSE);
      return;
    }

    const rows = await listRoles(options.db);
    await reply.code(200).send(rows.map(toRoleSummaryWire));
  });
}
