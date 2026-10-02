import { findBranchUser } from "@purosur/domain/access/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
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
import type { UsersRouteOptions } from "./users-list-route.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Answers identically whether the id is malformed, unknown, or another branch's, so none leaks which.
const NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no user with that id belongs to this branch",
} as const;

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
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: {
        access: capabilityAccess("users_area"),
        sessionSource,
      },
    },
    async (request, reply) => {
      const openSession = openSessionOf(request);
      const includesInactive = canReactivateUsers(openSession);

      const targetId = (request.params as { id: string }).id;
      if (!UUID_PATTERN.test(targetId)) {
        await reply.code(404).send(NOT_FOUND_RESPONSE);
        return;
      }

      const row = await findBranchUser(
        { users: drizzleBranchUsers(options.db) },
        {
          locationId: openSession.locationId,
          userId: targetId,
          activeScope: includesInactive ? "any" : "active",
        },
      );
      if (!row) {
        await reply.code(404).send(NOT_FOUND_RESPONSE);
        return;
      }

      await reply.code(200).send(toBranchUserWire(row, { includeActive: includesInactive }));
    },
  );
}
