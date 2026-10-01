import { buyerIdentificationThresholdListSchema } from "@purosur/contracts";
import { desc } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../access/backoffice-origin.js";
import {
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { buyerIdentificationThresholds } from "../platform/db/schema.js";

export interface BuyerIdentificationThresholdsRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now?: () => Date;
}

export function registerBuyerIdentificationThresholdsListRoute<
  TQueryResult extends PgQueryResultHKT,
>(app: FastifyInstance, options: BuyerIdentificationThresholdsRouteOptions<TQueryResult>): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.get(
    "/buyer-identification-thresholds",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: permissionAccess("change_fiscal_configuration"), sessionSource },
    },
    async (_request, reply) => {
      const rows = await options.db
        .select({
          id: buyerIdentificationThresholds.id,
          amount: buyerIdentificationThresholds.amount,
          valid_from: buyerIdentificationThresholds.validFrom,
        })
        .from(buyerIdentificationThresholds)
        .orderBy(desc(buyerIdentificationThresholds.validFrom));
      await reply.code(200).send(buyerIdentificationThresholdListSchema.parse(rows));
    },
  );
}
