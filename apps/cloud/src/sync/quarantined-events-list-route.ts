import { quarantinedEventsListSchema } from "@purosur/contracts";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleQuarantinedEventReader } from "./drizzle-quarantined-event-reader.js";

export interface QuarantinedEventsRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
}

export function registerQuarantinedEventsListRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: QuarantinedEventsRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const reader = new DrizzleQuarantinedEventReader(options.db);

  app.get(
    "/synced-events/quarantined",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("quarantined_events"), sessionSource },
    },
    async (request, reply) => {
      const events = await reader.quarantinedEventsOfBranch(openSessionOf(request).locationId);
      await reply.code(200).send(
        quarantinedEventsListSchema.parse({
          events: events.map((event) => ({
            ...event,
            receivedAt: event.receivedAt.toISOString(),
            quarantinedAt: event.quarantinedAt.toISOString(),
          })),
        }),
      );
    },
  );
}
