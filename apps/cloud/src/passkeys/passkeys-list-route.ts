import { asc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { passkeys } from "../db/schema.js";
import {
  checkBackofficeRateLimit,
  checkRequestIsSameOrigin,
  resolveOpenSession,
  UNAUTHENTICATED_RESPONSE,
} from "../session/open-session.js";

export interface PasskeysListRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  /** Injected in tests so idle/absolute expiry are checked against a deterministic clock. */
  now?: () => Date;
}

/**
 * Registers `GET /users/passkeys`: requires an already-open session (the same
 * `resolveOpenSession` check `GET /users/session` uses, including its same-origin guard) and
 * returns only that session's own account passkeys, oldest first, so the backoffice can list them
 * by name with registration date and last use (issue #169).
 */
export function registerPasskeysListRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: PasskeysListRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());

  app.get("/users/passkeys", async (request, reply) => {
    if (!checkRequestIsSameOrigin(request, reply, options.backofficeOrigin)) {
      return;
    }
    const checkedAt = now();
    if (!(await checkBackofficeRateLimit(request, reply, { db: options.db, now: checkedAt }))) {
      return;
    }

    const openSession = await resolveOpenSession(request, { db: options.db, now: checkedAt });
    if (!openSession) {
      await reply.code(401).send(UNAUTHENTICATED_RESPONSE);
      return;
    }

    const rows = await options.db
      .select({
        id: passkeys.id,
        name: passkeys.name,
        createdAt: passkeys.createdAt,
        lastUsedAt: passkeys.lastUsedAt,
      })
      .from(passkeys)
      .where(eq(passkeys.userId, openSession.userId))
      .orderBy(asc(passkeys.createdAt));

    await reply.code(200).send(
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        created_at: row.createdAt.toISOString(),
        last_used_at: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
      })),
    );
  });
}
