import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { auditLog, passkeys } from "../db/schema.js";
import { requireOpenSession } from "../session/open-session.js";
import { requirePasskeyAuthorization } from "../session/passkey-authorization-guard.js";

export interface PasskeyRemovalRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  /** Injected in tests so audited timestamps are deterministic. */
  now?: () => Date;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no passkey with that id belongs to this account",
} as const;

/**
 * Registers `POST /users/passkeys/:id/remove`: removes a passkey from an already-open session's
 * account — which may be the very one used to (re)authorize — gated by the shared
 * passkey-authorization window (`passkey-authorization-guard.ts`) instead of its own per-action
 * step-up. Never revokes the session, and removing the account's only remaining passkey is
 * allowed.
 */
export function registerPasskeyRemovalRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: PasskeyRemovalRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());

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

  app.post("/users/passkeys/:id/remove", async (request, reply) => {
    if (!checkOrigin(request, reply)) {
      return;
    }
    const attemptedAt = now();
    const openSession = await requireOpenSession(request, reply, {
      db: options.db,
      now: attemptedAt,
    });
    if (!openSession) {
      return;
    }

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
    });

    await reply.code(200).send();
  });
}
