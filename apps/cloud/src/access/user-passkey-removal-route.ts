import { findPasskeyRemovalTarget, removeUserPasskey } from "@purosur/domain/access/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { backofficeOriginGuard } from "./backoffice-origin.js";
import { drizzleBranchUsers } from "./drizzle-branch-users.js";
import { DrizzlePasskeyRemovalStore } from "./drizzle-passkey-removal-store.js";
import { requirePasskeyAuthorization } from "./passkey-authorization-guard.js";
import {
  ADMINISTRATOR_ACCESS,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "./route-access.js";
import type { UsersRouteOptions } from "./users-list-route.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const USER_NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no user with that id belongs to this branch",
} as const;

const PASSKEY_NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no passkey with that id belongs to this user",
} as const;

const OWN_ACCOUNT_RESPONSE = {
  code: "own_account",
  message: "use Mi cuenta to manage your own passkeys",
} as const;

export function registerUserPasskeyRemovalRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: UsersRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.delete<{ Params: { id: string; passkeyId: string } }>(
    "/users/:id/passkeys/:passkeyId",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: { access: ADMINISTRATOR_ACCESS, sessionSource },
    },
    async (request, reply) => {
      const attemptedAt = now();
      const openSession = openSessionOf(request);

      const target = await findPasskeyRemovalTarget(
        { users: drizzleBranchUsers(options.db) },
        {
          locationId: openSession.locationId,
          administratorId: openSession.userId,
          targetUserId: request.params.id,
        },
      );
      if (target.kind === "not_found") {
        await reply.code(404).send(USER_NOT_FOUND_RESPONSE);
        return;
      }
      if (target.kind === "own_account") {
        await reply.code(403).send(OWN_ACCOUNT_RESPONSE);
        return;
      }

      const passkeyId = request.params.passkeyId;
      if (!UUID_PATTERN.test(passkeyId)) {
        await reply.code(404).send(PASSKEY_NOT_FOUND_RESPONSE);
        return;
      }

      if (!(await requirePasskeyAuthorization(openSession, reply, attemptedAt))) {
        return;
      }

      const removed = await removeUserPasskey(
        { store: new DrizzlePasskeyRemovalStore(options.db) },
        {
          administratorId: openSession.userId,
          targetUserId: target.target.id,
          passkeyId,
          at: attemptedAt,
        },
      );
      if (removed.kind === "not_found") {
        await reply.code(404).send(PASSKEY_NOT_FOUND_RESPONSE);
        return;
      }

      await reply.code(200).send();
    },
  );
}
