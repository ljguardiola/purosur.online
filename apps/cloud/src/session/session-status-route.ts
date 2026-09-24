import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { checkRequestIsSameOrigin, peekOpenSession, sessionExpiresAt } from "./open-session.js";
import { OPEN_SESSION_ACCESS } from "./route-access.js";

export interface SessionStatusRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  /** Injected in tests so idle/absolute expiry are checked against a deterministic clock. */
  now?: () => Date;
}

/**
 * Registers `GET /users/session/status`: resolves the session cookie through the shared
 * `peekOpenSession` helper (idle/absolute expiry, deactivated-account check) without touching
 * `last_seen_at`, and returns the session's deadline so an already-open tab can notice its session
 * ended without keeping an idle one alive. Answers 401 `unauthenticated` when no open session is
 * found, the same as `GET /users/session`. Declared `open_session` for the route inventory, but
 * calls `peekOpenSession` directly rather than the shared `enforceRouteAccess` helper, since that
 * helper always touches `last_seen_at` and this route must never do that.
 */
export function registerSessionStatusRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: SessionStatusRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());

  app.get(
    "/users/session/status",
    { config: { access: OPEN_SESSION_ACCESS } },
    async (request, reply) => {
      if (!checkRequestIsSameOrigin(request, reply, options.backofficeOrigin)) {
        return;
      }
      const checkedAt = now();
      const openSession = await peekOpenSession(request, reply, {
        db: options.db,
        now: checkedAt,
      });
      if (!openSession) {
        return;
      }

      await reply.code(200).send({ expires_at: sessionExpiresAt(openSession).toISOString() });
    },
  );
}
