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
  /** Injected in tests so idle/absolute expiry are checked against a deterministic clock. */
  now?: () => Date;
}

/**
 * Registers `GET /users`: gated by `deactivate_users` or `reactivate_users` (an Administrator
 * always holds both), so a user who can deactivate or reactivate a colleague can also list who to.
 * Lists the session's own branch's users with their role; a caller who can reactivate
 * (`canReactivateUsers`) also gets every deactivated user, each with its `active` field, while
 * everyone else's response is unchanged: active users only, with no `active` field.
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
