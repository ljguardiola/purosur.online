import { currentZoneRulesSchema } from "@purosur/contracts";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  OPEN_SESSION_ACCESS,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzlePublishedZoneRulesReader } from "./drizzle-zone-rules-store.js";

export interface CurrentZoneRulesRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
}

const ZONE_RULES_NOT_PUBLISHED_RESPONSE = {
  code: "not_found",
  message: "no zone rules are published",
} as const;

export function registerCurrentZoneRulesRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: CurrentZoneRulesRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const reader = new DrizzlePublishedZoneRulesReader(options.db);

  app.get(
    "/zone-rules/current",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: OPEN_SESSION_ACCESS, sessionSource },
    },
    async (_request, reply) => {
      const current = await reader.currentZoneRules();
      if (current === null) {
        await reply.code(404).send(ZONE_RULES_NOT_PUBLISHED_RESPONSE);
        return;
      }
      await reply.code(200).send(
        currentZoneRulesSchema.parse({
          version: current.version,
          transitions: current.transitions.map(({ from, offsetMinutes }) => ({
            from: from.toISOString(),
            offset_minutes: offsetMinutes,
          })),
        }),
      );
    },
  );
}
