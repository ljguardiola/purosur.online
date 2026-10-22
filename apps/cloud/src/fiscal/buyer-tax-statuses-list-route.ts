import { buyerTaxStatusListSchema } from "@purosur/contracts";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleBuyerTaxStatusReader } from "./drizzle-buyer-tax-status-reader.js";

export interface BuyerTaxStatusesRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
}

export function registerBuyerTaxStatusesListRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: BuyerTaxStatusesRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const reader = new DrizzleBuyerTaxStatusReader(options.db);

  app.get(
    "/registers/buyer-tax-statuses",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("cash_area"), sessionSource },
    },
    async (_request, reply) => {
      const latest = await reader.latestBuyerTaxStatusSet();
      const statuses = (latest?.options ?? []).map(({ code, description }) => ({
        code,
        description,
      }));
      await reply.code(200).send(buyerTaxStatusListSchema.parse(statuses));
    },
  );
}
