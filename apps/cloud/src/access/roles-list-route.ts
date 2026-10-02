import { type RoleSummaryWire, roleSummarySchema } from "@purosur/contracts";
import { type PermissionKey, withOneAlertView } from "@purosur/domain";
import { listRoles, type RoleSummary } from "@purosur/domain/access/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "./backoffice-origin.js";
import { drizzleRoleDirectory } from "./drizzle-role-directory.js";
import { ADMINISTRATOR_ACCESS, registerRouteAccess, routeSessionSource } from "./route-access.js";

export interface RolesRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now?: () => Date;
}

export function toRoleSummaryWire(row: RoleSummary): RoleSummaryWire {
  return roleSummarySchema.parse({
    id: row.id,
    name: row.name,
    is_administrator: row.isAdministrator,
    permissions: [...withOneAlertView(row.permissionKeys as PermissionKey[])],
    user_count: row.userCount,
  });
}

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
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: ADMINISTRATOR_ACCESS, sessionSource },
    },
    async (_request, reply) => {
      const rows = await listRoles({ roles: drizzleRoleDirectory(options.db) });
      await reply.code(200).send(rows.map(toRoleSummaryWire));
    },
  );
}
