import { removeUserPasskey } from "@purosur/domain/credentials/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { readRecordIds } from "../platform/record-id-params.js";
import { backofficeOriginGuard } from "../sessions/backoffice-origin.js";
import { AUTHORIZATION_REQUIRED_RESPONSE } from "../sessions/passkey-authorization-guard.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import type { UsersRouteOptions } from "../users/users-list-route.js";
import { drizzlePasskeyHolders } from "./drizzle-passkey-holders.js";
import { DrizzlePasskeyRemovalStore } from "./drizzle-passkey-removal-store.js";

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
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.delete(
    "/users/:id/passkeys/:passkeyId",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("manage_users"), sessionSource },
    },
    async (request, reply) => {
      const ids = await readRecordIds(reply, request.params, ["id", "passkeyId"]);
      if (!ids) {
        return;
      }
      const attemptedAt = now();
      const openSession = openSessionOf(request);

      const outcome = await removeUserPasskey(
        {
          store: new DrizzlePasskeyRemovalStore(options.db, now),
          holders: drizzlePasskeyHolders(options.db),
        },
        {
          locationId: openSession.locationId,
          administratorId: openSession.userId,
          targetUserId: ids.id,
          passkeyId: ids.passkeyId,
          passkeyAuthorizedAt: openSession.passkeyAuthorizedAt,
          at: attemptedAt,
        },
      );
      if (outcome.kind === "authorization_required") {
        await reply.code(401).send(AUTHORIZATION_REQUIRED_RESPONSE);
        return;
      }
      if (outcome.kind === "user_not_found") {
        await reply.code(404).send(USER_NOT_FOUND_RESPONSE);
        return;
      }
      if (outcome.kind === "own_account") {
        await reply.code(403).send(OWN_ACCOUNT_RESPONSE);
        return;
      }
      if (outcome.kind === "passkey_not_found") {
        await reply.code(404).send(PASSKEY_NOT_FOUND_RESPONSE);
        return;
      }

      await reply.code(200).send();
    },
  );
}
