import { unbilledDeferredSalesSchema } from "@purosur/contracts";
import { deferredSaleAgeInDays } from "@purosur/domain";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleUnbilledDeferredSaleReader } from "./drizzle-unbilled-deferred-sale-reader.js";

export interface UnbilledDeferredSalesRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
}

export function registerUnbilledDeferredSalesRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: UnbilledDeferredSalesRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const reader = new DrizzleUnbilledDeferredSaleReader(options.db);

  app.get(
    "/fiscal/unbilled-deferred-sales",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("fiscal_information"), sessionSource },
    },
    async (request, reply) => {
      const { count, oldestOccurredAt } = await reader.unbilledDeferredSalesOfBranch(
        openSessionOf(request).locationId,
      );
      await reply.code(200).send(
        unbilledDeferredSalesSchema.parse({
          count,
          oldest:
            oldestOccurredAt === null
              ? null
              : {
                  occurred_at: oldestOccurredAt.toISOString(),
                  age_days: deferredSaleAgeInDays(oldestOccurredAt, now()),
                },
        }),
      );
    },
  );
}
