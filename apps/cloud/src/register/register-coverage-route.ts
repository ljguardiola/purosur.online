import { registerCoverageSchema } from "@purosur/contracts";
import { findUncoveredRegisterPermissions } from "@purosur/domain/access/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../access/backoffice-origin.js";
import { drizzleBranchUsers } from "../access/drizzle-branch-users.js";
import {
  openSessionOf,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import type { RegistersRouteOptions } from "./registers-list-route.js";

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

      const uncovered = await findUncoveredRegisterPermissions(
        { users: drizzleBranchUsers(options.db) },
        { locationId: openSession.locationId },
      );
      await reply
        .code(200)
        .send(registerCoverageSchema.parse({ uncovered_permissions: uncovered }));
    },
  );
}
