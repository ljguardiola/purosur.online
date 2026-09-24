import { eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { rolePermissions, roles, userRoles, users } from "../db/schema.js";
import { checkRequestIsSameOrigin } from "../session/open-session.js";
import { ADMINISTRATOR_ACCESS, enforceRouteAccess } from "../session/route-access.js";
import { PERMISSION_KEYS } from "./permission-catalog.js";
import type { RoleSummaryRow, RoleSummaryWire, RolesRouteOptions } from "./roles-list-route.js";
import { toRoleSummaryWire } from "./roles-list-route.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The Administrator role is never an editable target, so it answers identically to a missing or
// malformed id, the same "none of the three ever leaks which one it was" reasoning
// `user-read-route.ts` and `user-email-change-route.ts` apply to a cross-branch user id.
const NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no editable role with that id",
} as const;

export interface RoleDetailRow extends RoleSummaryRow {
  version: number;
}

export interface RoleDetailWire extends RoleSummaryWire {
  version: number;
}

export function toRoleDetailWire(row: RoleDetailRow): RoleDetailWire {
  return { ...toRoleSummaryWire(row), version: row.version };
}

export async function countRoleUsers<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  roleId: string,
  locationId: string,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(sql`${userRoles.roleId} = ${roleId} and ${users.locationId} = ${locationId}`);
  return row?.count ?? 0;
}

/**
 * Reads one hand-made role by id, never the Administrator role, for `GET /roles/:id` and for
 * `role-edit-route.ts`'s own step-up and edit routes: all three share this exact "malformed,
 * missing, and Administrator all answer alike" lookup.
 */
export async function findEditableRole<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  id: string,
): Promise<RoleDetailRow | undefined> {
  if (!UUID_PATTERN.test(id)) {
    return undefined;
  }
  const [role] = await db
    .select({
      id: roles.id,
      name: roles.name,
      isAdministrator: roles.isAdministrator,
      version: roles.version,
    })
    .from(roles)
    .where(eq(roles.id, id));
  if (!role || role.isAdministrator) {
    return undefined;
  }
  const permissionRows = await db
    .select({ permissionKey: rolePermissions.permissionKey })
    .from(rolePermissions)
    .where(eq(rolePermissions.roleId, id));
  const storedKeys = new Set(permissionRows.map((row) => row.permissionKey));
  return {
    id: role.id,
    name: role.name,
    isAdministrator: false,
    permissionKeys: PERMISSION_KEYS.filter((key) => storedKeys.has(key)),
    userCount: 0,
    version: role.version,
  };
}

/**
 * Registers `GET /roles/:id`: same session, origin, and Administrator-only guard as `GET /roles`,
 * then answers one hand-made role's current name, permissions, user count, and version — the
 * version an edit sends back so a save made over a change someone else already applied is
 * rejected instead of silently overwriting it.
 */
export function registerRoleReadRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: RolesRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());

  app.get("/roles/:id", { config: { access: ADMINISTRATOR_ACCESS } }, async (request, reply) => {
    if (!checkRequestIsSameOrigin(request, reply, options.backofficeOrigin)) {
      return;
    }
    const checkedAt = now();
    const openSession = await enforceRouteAccess(request, reply, {
      db: options.db,
      now: checkedAt,
    });
    if (!openSession) {
      return;
    }

    const targetId = (request.params as { id: string }).id;
    const role = await findEditableRole(options.db, targetId);
    if (!role) {
      await reply.code(404).send(NOT_FOUND_RESPONSE);
      return;
    }

    const userCount = await countRoleUsers(options.db, role.id, openSession.locationId);
    await reply.code(200).send(toRoleDetailWire({ ...role, userCount }));
  });
}
