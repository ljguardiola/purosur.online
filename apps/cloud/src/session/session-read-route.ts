import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { checkRequestIsSameOrigin, requireOpenSession } from "./open-session.js";

export interface SessionReadRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  /** Injected in tests so idle/absolute expiry are checked against a deterministic clock. */
  now?: () => Date;
}

/**
 * Registers `GET /users/session`: resolves the session cookie through the shared
 * `requireOpenSession` helper (idle/absolute expiry, `last_seen_at` touch, deactivated-account
 * check) and returns the signed-in user's identity for the shell to render. Answers 401
 * `unauthenticated` when no open session is found.
 */
export function registerSessionReadRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: SessionReadRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());

  app.get("/users/session", async (request, reply) => {
    if (!checkRequestIsSameOrigin(request, reply, options.backofficeOrigin)) {
      return;
    }
    const checkedAt = now();
    const openSession = await requireOpenSession(request, reply, {
      db: options.db,
      now: checkedAt,
    });
    if (!openSession) {
      return;
    }

    await reply
      .code(200)
      .send({ user_id: openSession.userId, display_name: openSession.firstName });
  });
}
