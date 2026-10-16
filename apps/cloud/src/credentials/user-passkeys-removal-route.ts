import { removeEveryUserPasskey } from "@purosur/domain/credentials/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { readRecordIds } from "../platform/record-id-params.js";
import { backofficeOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import type { UsersRouteOptions } from "../users/users-list-route.js";
import { drizzlePasskeyHolders } from "./drizzle-passkey-holders.js";
import { DrizzlePasskeyRemovalStore } from "./drizzle-passkey-removal-store.js";
import { AUTHORIZATION_REQUIRED_RESPONSE } from "./passkey-authorization-guard.js";

const USER_NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no user with that id belongs to this branch",
} as const;

const OWN_ACCOUNT_RESPONSE = {
  code: "own_account",
  message: "use Mi cuenta to manage your own passkeys",
} as const;

const NO_PASSKEYS_RESPONSE = {
  code: "no_passkeys",
  message: "this user has no passkeys to remove",
} as const;

export function registerUserPasskeysRemovalRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: UsersRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.delete(
    "/users/:id/passkeys",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("manage_users"), sessionSource },
    },
    async (request, reply) => {
      const ids = await readRecordIds(reply, request.params, ["id"]);
      if (!ids) {
        return;
      }
      const openSession = openSessionOf(request);

      const outcome = await removeEveryUserPasskey(
        {
          store: new DrizzlePasskeyRemovalStore(options.db, now),
          holders: drizzlePasskeyHolders(options.db),
        },
        {
          locationId: openSession.locationId,
          administratorId: openSession.userId,
          targetUserId: ids.id,
          passkeyAuthorizedAt: openSession.passkeyAuthorizedAt,
          at: now(),
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
      if (outcome.kind === "no_passkeys") {
        await reply.code(409).send(NO_PASSKEYS_RESPONSE);
        return;
      }

      await reply.code(200).send();
    },
  );
}
