import { registerCoverageSchema } from "@purosur/contracts";
import { findUncoveredRegisterPermissions } from "@purosur/domain/users/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { drizzleBranchUsers } from "../users/drizzle-branch-users.js";
import type { RegistersRouteOptions } from "./registers-list-route.js";

export function registerRegisterCoverageRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: RegistersRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.get(
    "/registers/coverage",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("registers_area"), sessionSource },
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
