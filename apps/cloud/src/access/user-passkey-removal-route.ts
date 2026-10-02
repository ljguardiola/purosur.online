import { removeUserPasskey } from "@purosur/domain/access/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { backofficeOriginGuard } from "./backoffice-origin.js";
import { drizzleBranchUsers } from "./drizzle-branch-users.js";
import { DrizzlePasskeyRemovalStore } from "./drizzle-passkey-removal-store.js";
import { AUTHORIZATION_REQUIRED_RESPONSE } from "./passkey-authorization-guard.js";
import {
  ADMINISTRATOR_ACCESS,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "./route-access.js";
import type { UsersRouteOptions } from "./users-list-route.js";

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

      const outcome = await removeUserPasskey(
        {
          users: drizzleBranchUsers(options.db),
          store: new DrizzlePasskeyRemovalStore(options.db),
        },
        {
          locationId: openSession.locationId,
          administratorId: openSession.userId,
          targetUserId: request.params.id,
          passkeyId: request.params.passkeyId,
          passkeyAuthorizedAt: openSession.passkeyAuthorizedAt,
          at: attemptedAt,
        },
      );
      switch (outcome.kind) {
        case "user_not_found":
          await reply.code(404).send(USER_NOT_FOUND_RESPONSE);
          return;
        case "own_account":
          await reply.code(403).send(OWN_ACCOUNT_RESPONSE);
          return;
        case "passkey_not_found":
          await reply.code(404).send(PASSKEY_NOT_FOUND_RESPONSE);
          return;
        case "authorization_required":
          await reply.code(401).send(AUTHORIZATION_REQUIRED_RESPONSE);
          return;
        case "removed":
          break;
      }

      await reply.code(200).send();
    },
  );
}
