import { signOut } from "@purosur/domain/access/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { backofficeOriginGuard } from "./backoffice-origin.js";
import { drizzleSessionStore } from "./drizzle-session-store.js";
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
  now: () => Date;
}

export function registerSessionSignOutRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: SessionSignOutRouteOptions<TQueryResult>,
): void {
  const { now } = options;
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

      await signOut(
        { store: drizzleSessionStore(options.db) },
        { sessionKey: hashSessionId(rawSessionId), at: now() },
      );

      await reply.header("Set-Cookie", clearSessionCookie()).code(200).send();
    },
  );
}
