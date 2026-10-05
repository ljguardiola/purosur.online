import { listBranchUsers } from "@purosur/domain/access/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "./backoffice-origin.js";
import { canReactivateUsers, toBranchUserWire } from "./branch-users.js";
import { drizzleBranchUsers } from "./drizzle-branch-users.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "./route-access.js";

export interface UsersRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now?: () => Date;
}

export function registerUsersListRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: UsersRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.get(
    "/users",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: {
        access: capabilityAccess("users_area"),
        sessionSource,
      },
    },
    async (request, reply) => {
      const openSession = openSessionOf(request);
      const includesInactive = canReactivateUsers(openSession);

      const rows = await listBranchUsers(
        { users: drizzleBranchUsers(options.db) },
        {
          locationId: openSession.locationId,
          activeScope: includesInactive ? "any" : "active",
        },
      );
      await reply
        .code(200)
        .send(
          rows.map((row) =>
            toBranchUserWire(row, openSession, { includeActive: includesInactive }),
          ),
        );
    },
  );
}
