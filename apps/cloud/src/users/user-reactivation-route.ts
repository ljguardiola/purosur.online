import { findBranchUser, reactivateUser } from "@purosur/domain/users/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { readRecordIds } from "../platform/record-id-params.js";
import { backofficeOriginGuard } from "../sessions/backoffice-origin.js";
import { requirePasskeyAuthorization } from "../sessions/passkey-authorization-guard.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { drizzleBranchUsers } from "./drizzle-branch-users.js";
import { DrizzleUserStore } from "./drizzle-user-store.js";
import type { UserChangeRouteOptions } from "./users-list-route.js";

const USER_NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no user with that id belongs to this branch",
} as const;

export function registerUserReactivationRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: UserChangeRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.delete(
    "/users/:id/deactivation",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("reactivate_users"), sessionSource },
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

      // An already-active target answers the same 404 as a missing one.
      const target = await findBranchUser(
        { users: drizzleBranchUsers(options.db) },
        { locationId: openSession.locationId, userId: ids.id, activeScope: "inactive" },
      );
      if (!target) {
        await reply.code(404).send(USER_NOT_FOUND_RESPONSE);
        return;
      }

      const outcome = await reactivateUser(
        { store: new DrizzleUserStore(options.db, now, options.voidOutstandingRecoveryTokens) },
        { id: target.id, actorId: openSession.userId },
      );

      if (outcome.kind === "not_found") {
        await reply.code(404).send(USER_NOT_FOUND_RESPONSE);
        return;
      }

      await reply.code(200).send();
    },
  );
}
