import { registerCoverageSchema } from "@purosur/contracts";
import { uncoveredRegisterPermissions } from "@purosur/domain";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../access/backoffice-origin.js";
import {
  openSessionOf,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { rolePermissions, userRoles, users } from "../platform/db/schema.js";
import type { RegistersRouteOptions } from "./registers-list-route.js";

// Only the permissions a role lists count: the Administrator role holds every permission
// implicitly and lists none, so an active Administrator never covers a register action.
async function permissionsHeldByActiveBranchUsers<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  locationId: string,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ permissionKey: rolePermissions.permissionKey })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
    .where(and(eq(users.locationId, locationId), eq(users.active, true)));
  return rows.map((row) => row.permissionKey);
}

export function registerRegisterCoverageRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: RegistersRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.get(
    "/registers/coverage",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: permissionAccess("enroll_register_devices"), sessionSource },
    },
    async (request, reply) => {
      const openSession = openSessionOf(request);

      const held = await permissionsHeldByActiveBranchUsers(options.db, openSession.locationId);
      await reply.code(200).send(
        registerCoverageSchema.parse({
          uncovered_permissions: uncoveredRegisterPermissions(held),
        }),
      );
    },
  );
}
