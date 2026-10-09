import { type RoleSummaryWire, roleSummarySchema } from "@purosur/contracts";
import { mayEditRole, type PermissionKey, withOneAlertView } from "@purosur/domain";
import { listRoles, type RoleSummary } from "@purosur/domain/permissions/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import type { OpenSession } from "../sessions/open-session.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { drizzleRoleDirectory } from "./drizzle-role-directory.js";

export interface RolesRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
}

export function toRoleSummaryWire(
  row: RoleSummary,
  session: Pick<OpenSession, "isAdministrator" | "permissionKeys">,
): RoleSummaryWire {
  return roleSummarySchema.parse({
    id: row.id,
    name: row.name,
    is_administrator: row.isAdministrator,
    permissions: [...withOneAlertView(row.permissionKeys as PermissionKey[])],
    user_count: row.userCount,
    may_edit: mayEditRole(session, { isAdministrator: row.isAdministrator }),
  });
}

export function registerRolesListRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: RolesRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.get(
    "/roles",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("manage_roles"), sessionSource },
    },
    async (request, reply) => {
      const session = openSessionOf(request);
      const rows = await listRoles({ roles: drizzleRoleDirectory(options.db) });
      await reply.code(200).send(rows.map((row) => toRoleSummaryWire(row, session)));
    },
  );
}
