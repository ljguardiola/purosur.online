import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { checkRequestIsSameOrigin } from "../session/open-session.js";
import {
  ADMINISTRATOR_ACCESS,
  openSessionOf,
  originGuard,
  registerRouteAccess,
  routeSessionSource,
} from "../session/route-access.js";
import { findBranchUser, toBranchUserWire } from "./branch-users.js";
import type { UsersRouteOptions } from "./users-list-route.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Answers identically whether the id is malformed, unknown, or belongs to another branch, so none
// of the three ever leaks which one it was.
const NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no user with that id belongs to this branch",
} as const;

/**
 * Registers `GET /users/:id`: same session, origin, and Administrator-only guard as
 * `GET /users`, then answers that one user's shape only when they belong to the session's own
 * branch. A malformed id, a missing id, and an id from another branch all get the identical 404
 * `not_found`.
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
      config: { access: ADMINISTRATOR_ACCESS, sessionSource },
    },
    async (request, reply) => {
      const openSession = openSessionOf(request);

      const targetId = (request.params as { id: string }).id;
      if (!UUID_PATTERN.test(targetId)) {
        await reply.code(404).send(NOT_FOUND_RESPONSE);
        return;
      }

      const row = await findBranchUser(options.db, openSession.locationId, targetId);
      if (!row) {
        await reply.code(404).send(NOT_FOUND_RESPONSE);
        return;
      }

      await reply.code(200).send(toBranchUserWire(row));
    },
  );
}
