import { and, eq, isNull } from "drizzle-orm";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { openAlert } from "../alerts/open-alert.js";
import { auditLog, passkeys, sessions } from "../platform/db/schema.js";
import { backofficeOriginGuard } from "./backoffice-origin.js";
import { findBranchUser } from "./branch-users.js";
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

  async function findTarget(locationId: string, targetId: string) {
    if (!UUID_PATTERN.test(targetId)) {
      return undefined;
    }
    return findBranchUser(options.db, locationId, targetId);
  }

  app.post<{ Params: { id: string; passkeyId: string } }>(
    "/users/:id/passkeys/:passkeyId/remove",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: { access: ADMINISTRATOR_ACCESS, sessionSource },
    },
    async (request, reply) => {
      const attemptedAt = now();
      const openSession = openSessionOf(request);

      const target = await findTarget(openSession.locationId, request.params.id);
      if (!target) {
        await reply.code(404).send(USER_NOT_FOUND_RESPONSE);
        return;
      }
      if (target.id === openSession.userId) {
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

      const removed = await options.db.transaction(async (tx) => {
        // Deleting first takes the passkey's row lock, so a concurrent removal of it finds nothing
        // (not_found), and a racing sign-in with it has already committed its session before the revoke below.
        const [removedPasskey] = await tx
          .delete(passkeys)
          .where(and(eq(passkeys.id, passkeyId), eq(passkeys.userId, target.id)))
          .returning({ id: passkeys.id, name: passkeys.name });
        if (!removedPasskey) {
          return undefined;
        }

        // A session open on a lost device must not outlive its removed passkey, so every session
        // of the target ends here.
        await tx
          .update(sessions)
          .set({ revokedAt: attemptedAt })
          .where(and(eq(sessions.userId, target.id), isNull(sessions.revokedAt)));

        await tx.insert(auditLog).values({
          entity: "passkey",
          entityId: removedPasskey.id,
          actorId: openSession.userId,
          previousValue: { id: removedPasskey.id, name: removedPasskey.name, userId: target.id },
          newValue: null,
        });

        await openAlert(
          tx,
          {
            kind: "backoffice_passkey_changed",
            scope: target.id,
            detail: {
              action: "removed",
              passkeyName: removedPasskey.name,
              actorId: openSession.userId,
              via: "administrator",
            },
          },
          { now },
        );

        return removedPasskey;
      });
      if (!removed) {
        await reply.code(404).send(PASSKEY_NOT_FOUND_RESPONSE);
        return;
      }

      await reply.code(200).send();
    },
  );
}
