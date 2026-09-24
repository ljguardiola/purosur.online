import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { checkRequestIsSameOrigin, sessionExpiresAt } from "./open-session.js";
import { enforceRouteAccess, OPEN_SESSION_ACCESS } from "./route-access.js";

export interface SessionReadRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  /** Injected in tests so idle/absolute expiry are checked against a deterministic clock. */
  now?: () => Date;
}

/**
 * Registers `GET /users/session`: resolves the session cookie through the shared
 * `enforceRouteAccess` helper (idle/absolute expiry, `last_seen_at` touch, deactivated-account
 * check) and returns the signed-in user's identity, plus the session's deadline (computed after
 * the touch) so the client can schedule its next status probe, whether they're an Administrator,
 * and their permission keys, so the backoffice can decide what to show without a request that would
 * only answer 403. Answers 401 `unauthenticated` when no open session is found.
 */
export function registerSessionReadRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: SessionReadRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());

  app.get("/users/session", { config: { access: OPEN_SESSION_ACCESS } }, async (request, reply) => {
    if (!checkRequestIsSameOrigin(request, reply, options.backofficeOrigin)) {
      return;
    }
    const checkedAt = now();
    const openSession = await enforceRouteAccess(request, reply, {
      db: options.db,
      now: checkedAt,
    });
    if (!openSession) {
      return;
    }

    await reply.code(200).send({
      user_id: openSession.userId,
      display_name: openSession.firstName,
      expires_at: sessionExpiresAt(openSession).toISOString(),
      is_administrator: openSession.isAdministrator,
      permissions: [...openSession.permissionKeys],
    });
  });
}
