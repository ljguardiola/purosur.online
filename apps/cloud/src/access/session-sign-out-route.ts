import { and, eq, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sessions } from "../platform/db/schema.js";
import { backofficeOriginGuard } from "./backoffice-origin.js";
import {
  registerRouteAccess,
  routeSessionSource,
  SESSION_COOKIE_ACCESS,
  sessionCookieOf,
} from "./route-access.js";
import { clearSessionCookie } from "./session-cookie.js";
import { hashSessionId } from "./session-id.js";

export interface SessionSignOutRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now?: () => Date;
}

export function registerSessionSignOutRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: SessionSignOutRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.delete(
    "/sessions/current",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: { access: SESSION_COOKIE_ACCESS, sessionSource },
    },
    async (request, reply) => {
      const rawSessionId = sessionCookieOf(request);

      await options.db
        .update(sessions)
        .set({ revokedAt: now() })
        .where(
          and(eq(sessions.sessionIdHash, hashSessionId(rawSessionId)), isNull(sessions.revokedAt)),
        );

      await reply.header("Set-Cookie", clearSessionCookie()).code(200).send();
    },
  );
}
