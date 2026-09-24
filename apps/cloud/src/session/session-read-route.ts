import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { checkRequestIsSameOrigin, sessionExpiresAt } from "./open-session.js";
import {
  OPEN_SESSION_ACCESS,
  openSessionOf,
  originGuard,
  registerRouteAccess,
  routeSessionSource,
} from "./route-access.js";

export interface SessionReadRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  /** Injected in tests so idle/absolute expiry are checked against a deterministic clock. */
  now?: () => Date;
}

/**
 * Registers `GET /users/session`: resolves the session cookie through its declared open-session
 * access (idle/absolute expiry, `last_seen_at` touch, deactivated-account
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
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.get(
    "/users/session",
    {
      preHandler: originGuard((request, reply) =>
        checkRequestIsSameOrigin(request, reply, options.backofficeOrigin),
      ),
      config: { access: OPEN_SESSION_ACCESS, sessionSource },
    },
    async (request, reply) => {
      const openSession = openSessionOf(request);

      await reply.code(200).send({
        user_id: openSession.userId,
        display_name: openSession.firstName,
        expires_at: sessionExpiresAt(openSession).toISOString(),
        is_administrator: openSession.isAdministrator,
        permissions: [...openSession.permissionKeys],
      });
    },
  );
}
