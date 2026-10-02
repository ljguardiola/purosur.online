import { sessionStatusSchema } from "@purosur/contracts";
import { sessionExpiresAt } from "@purosur/domain";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "./backoffice-origin.js";
import {
  OPEN_SESSION_PEEK_ACCESS,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "./route-access.js";

export interface SessionStatusRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now?: () => Date;
}

export function registerSessionStatusRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: SessionStatusRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.get(
    "/sessions/current/expiration",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: OPEN_SESSION_PEEK_ACCESS, sessionSource },
    },
    async (request, reply) => {
      const openSession = openSessionOf(request);
      await reply
        .code(200)
        .send(
          sessionStatusSchema.parse({ expires_at: sessionExpiresAt(openSession).toISOString() }),
        );
    },
  );
}
