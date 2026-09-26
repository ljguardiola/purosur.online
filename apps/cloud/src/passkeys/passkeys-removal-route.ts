import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { openAlert } from "../alerts/open-alert.js";
import { auditLog, passkeys } from "../db/schema.js";
import { requirePasskeyAuthorization } from "../session/passkey-authorization-guard.js";
import {
  OPEN_SESSION_ACCESS,
  openSessionOf,
  originGuard,
  registerRouteAccess,
  routeSessionSource,
} from "../session/route-access.js";

export interface PasskeyRemovalRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now?: () => Date;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no passkey with that id belongs to this account",
} as const;

export function registerPasskeyRemovalRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: PasskeyRemovalRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  function checkOrigin(request: FastifyRequest, reply: FastifyReply): boolean {
    if (request.headers.origin !== options.backofficeOrigin) {
      void reply.code(403).send({
        code: "origin_rejected",
        message: "the request's Origin does not match the backoffice's own origin",
      });
      return false;
    }
    return true;
  }

  app.post(
    "/users/passkeys/:id/remove",
    {
      preHandler: originGuard(checkOrigin),
      config: { access: OPEN_SESSION_ACCESS, sessionSource },
    },
    async (request, reply) => {
      const attemptedAt = now();
      const openSession = openSessionOf(request);

      const targetId = (request.params as { id: string }).id;
      if (!UUID_PATTERN.test(targetId)) {
        await reply.code(404).send(NOT_FOUND_RESPONSE);
        return;
      }

      if (!(await requirePasskeyAuthorization(openSession, reply, attemptedAt))) {
        return;
      }

      const [target] = await options.db
        .select({ id: passkeys.id, name: passkeys.name })
        .from(passkeys)
        .where(and(eq(passkeys.id, targetId), eq(passkeys.userId, openSession.userId)))
        .limit(1);
      if (!target) {
        await reply.code(404).send(NOT_FOUND_RESPONSE);
        return;
      }

      await options.db.transaction(async (tx) => {
        await tx.delete(passkeys).where(eq(passkeys.id, target.id));
        await tx.insert(auditLog).values({
          entity: "passkey",
          entityId: target.id,
          actorId: openSession.userId,
          previousValue: { id: target.id, name: target.name },
          newValue: null,
        });
        await openAlert(
          tx,
          {
            kind: "backoffice_passkey_changed",
            scope: openSession.userId,
            detail: {
              action: "removed",
              passkeyName: target.name,
              actorId: openSession.userId,
              via: "self",
            },
          },
          { now },
        );
      });

      await reply.code(200).send();
    },
  );
}
