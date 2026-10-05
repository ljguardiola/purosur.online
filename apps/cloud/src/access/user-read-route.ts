import { findBranchUser } from "@purosur/domain/access/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { readRecordIds } from "../platform/record-id-params.js";
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

// Answers identically whether the id is unknown or another branch's, so neither leaks.
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
      const ids = await readRecordIds(reply, request.params, ["id"]);
      if (!ids) {
        return;
      }
      const openSession = openSessionOf(request);
      const includesInactive = canReactivateUsers(openSession);

      const targetId = ids.id;

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

      await reply
        .code(200)
        .send(toBranchUserWire(row, openSession, { includeActive: includesInactive }));
    },
  );
}
