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
import { listBranchUsers, toBranchUserWire } from "./branch-users.js";

export interface UsersRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  /** Injected in tests so idle/absolute expiry are checked against a deterministic clock. */
  now?: () => Date;
}

/**
 * Registers `GET /users`: gated by the `deactivate_users` permission (an Administrator always
 * holds it too), so a user who can deactivate a colleague can also list who to deactivate; then
 * lists the active users of the session's own branch with their role.
 */
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
      config: { access: permissionAccess("deactivate_users"), sessionSource },
    },
    async (request, reply) => {
      const openSession = openSessionOf(request);

      const rows = await listBranchUsers(options.db, openSession.locationId);
      await reply.code(200).send(rows.map(toBranchUserWire));
    },
  );
}
