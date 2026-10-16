import { endEveryBackofficeSession } from "@purosur/domain/sessions/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { backofficeOriginGuard } from "./backoffice-origin.js";
import { DrizzleBackofficeSessionEndingStore } from "./drizzle-backoffice-session-ending-store.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "./route-access.js";
import { clearSessionCookie } from "./session-cookie.js";

export interface EverySessionEndingRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
}

export function registerEverySessionEndingRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: EverySessionEndingRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.delete(
    "/sessions",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("manage_users"), sessionSource },
    },
    async (request, reply) => {
      await endEveryBackofficeSession(
        { store: new DrizzleBackofficeSessionEndingStore(options.db) },
        { actorId: openSessionOf(request).userId, at: now() },
      );

      await reply.header("Set-Cookie", clearSessionCookie()).code(200).send();
    },
  );
}
