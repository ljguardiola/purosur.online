import { deactivateUser, findDeactivatableUser } from "@purosur/domain/users/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { readRecordIds } from "../platform/record-id-params.js";
import { backofficeOriginGuard } from "./backoffice-origin.js";
import { drizzleBranchUsers } from "./drizzle-branch-users.js";
import { DrizzleUserStore } from "./drizzle-user-store.js";
import { requirePasskeyAuthorization } from "./passkey-authorization-guard.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "./route-access.js";
import type { UsersRouteOptions } from "./users-list-route.js";

const USER_NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no user with that id belongs to this branch",
} as const;

export function registerUserDeactivationRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: UsersRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.put(
    "/users/:id/deactivation",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("deactivate_users"), sessionSource },
    },
    async (request, reply) => {
      const ids = await readRecordIds(reply, request.params, ["id"]);
      if (!ids) {
        return;
      }
      const attemptedAt = now();
      const openSession = openSessionOf(request);

      if (!(await requirePasskeyAuthorization(openSession, reply, attemptedAt))) {
        return;
      }

      const target = await findDeactivatableUser(
        { users: drizzleBranchUsers(options.db) },
        {
          locationId: openSession.locationId,
          userId: ids.id,
          actorId: openSession.userId,
        },
      );
      if (!target) {
        await reply.code(404).send(USER_NOT_FOUND_RESPONSE);
        return;
      }

      const outcome = await deactivateUser(
        { store: new DrizzleUserStore(options.db, now) },
        { id: target.id, actorId: openSession.userId, at: attemptedAt },
      );

      if (outcome.kind === "not_found") {
        await reply.code(404).send(USER_NOT_FOUND_RESPONSE);
        return;
      }

      await reply.code(200).send();
    },
  );
}
