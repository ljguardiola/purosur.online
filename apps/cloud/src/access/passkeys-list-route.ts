import { passkeyListSchema } from "@purosur/contracts";
import { listOwnPasskeys } from "@purosur/domain/credentials/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "./backoffice-origin.js";
import { drizzlePasskeys } from "./drizzle-passkeys.js";
import {
  OPEN_SESSION_ACCESS,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "./route-access.js";

export interface PasskeysListRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
}

export function registerPasskeysListRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: PasskeysListRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.get(
    "/account/passkeys",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: OPEN_SESSION_ACCESS, sessionSource },
    },
    async (request, reply) => {
      const openSession = openSessionOf(request);

      const rows = await listOwnPasskeys(
        { passkeys: drizzlePasskeys(options.db) },
        { userId: openSession.userId },
      );

      await reply.code(200).send(
        passkeyListSchema.parse(
          rows.map((row) => ({
            id: row.id,
            name: row.name,
            created_at: row.createdAt.toISOString(),
            last_used_at: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
          })),
        ),
      );
    },
  );
}
