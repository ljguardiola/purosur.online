import { asc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { passkeys } from "../db/schema.js";
import { checkRequestIsSameOrigin } from "../session/open-session.js";
import {
  OPEN_SESSION_ACCESS,
  openSessionOf,
  originGuard,
  registerRouteAccess,
  routeSessionSource,
} from "../session/route-access.js";

export interface PasskeysListRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  /** Injected in tests so idle/absolute expiry are checked against a deterministic clock. */
  now?: () => Date;
}

/**
 * Registers `GET /users/passkeys`: requires an already-open session (the same open-session
 * access `GET /users/session` declares, behind its same-origin guard) and
 * returns only that session's own account passkeys, oldest first, so the backoffice can list them
 * by name with registration date and last use.
 */
export function registerPasskeysListRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: PasskeysListRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.get(
    "/users/passkeys",
    {
      preHandler: originGuard((request, reply) =>
        checkRequestIsSameOrigin(request, reply, options.backofficeOrigin),
      ),
      config: { access: OPEN_SESSION_ACCESS, sessionSource },
    },
    async (request, reply) => {
      const openSession = openSessionOf(request);

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
    },
  );
}
