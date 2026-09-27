import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { checkRequestIsSameOrigin } from "../session/open-session.js";
import {
  openSessionOf,
  originGuard,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../session/route-access.js";
import { canReactivateUsers, listBranchUsers, toBranchUserWire } from "./branch-users.js";

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
      preHandler: originGuard((request, reply) =>
        checkRequestIsSameOrigin(request, reply, options.backofficeOrigin),
      ),
      config: { access: permissionAccess(["deactivate_users", "reactivate_users"]), sessionSource },
    },
    async (request, reply) => {
      const openSession = openSessionOf(request);
      const includesInactive = canReactivateUsers(openSession);

      const rows = await listBranchUsers(options.db, openSession.locationId, {
        activeScope: includesInactive ? "any" : "active",
      });
      await reply
        .code(200)
        .send(rows.map((row) => toBranchUserWire(row, { includeActive: includesInactive })));
    },
  );
}
