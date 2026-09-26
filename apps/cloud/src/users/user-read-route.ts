import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { checkRequestIsSameOrigin } from "../session/open-session.js";
import {
  openSessionOf,
  originGuard,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../session/route-access.js";
import { canReactivateUsers, findBranchUser, toBranchUserWire } from "./branch-users.js";
import type { UsersRouteOptions } from "./users-list-route.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Answers identically whether the id is malformed, unknown, or belongs to another branch, so none
// of the three ever leaks which one it was.
const NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no user with that id belongs to this branch",
} as const;

/**
 * Registers `GET /users/:id`: same session, origin, and access guard as `GET /users`, then answers
 * that one user's shape only when they belong to the session's own branch. A malformed id, a
 * missing id, and an id from another branch all get the identical 404 `not_found`; so does an
 * inactive id, unless the caller can reactivate (`canReactivateUsers`), in which case it answers
 * that deactivated user's shape, with its `active` field, instead.
 */
export function registerUserReadRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: UsersRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.get(
    "/users/:id",
    {
      preHandler: originGuard((request, reply) =>
        checkRequestIsSameOrigin(request, reply, options.backofficeOrigin),
      ),
      config: { access: permissionAccess(["deactivate_users", "reactivate_users"]), sessionSource },
    },
    async (request, reply) => {
      const openSession = openSessionOf(request);
      const includesInactive = canReactivateUsers(openSession);

      const targetId = (request.params as { id: string }).id;
      if (!UUID_PATTERN.test(targetId)) {
        await reply.code(404).send(NOT_FOUND_RESPONSE);
        return;
      }

      const row = await findBranchUser(options.db, openSession.locationId, targetId, {
        activeScope: includesInactive ? "any" : "active",
      });
      if (!row) {
        await reply.code(404).send(NOT_FOUND_RESPONSE);
        return;
      }

      await reply.code(200).send(toBranchUserWire(row, { includeActive: includesInactive }));
    },
  );
}
