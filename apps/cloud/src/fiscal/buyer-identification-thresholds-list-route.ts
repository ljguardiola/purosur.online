import { buyerIdentificationThresholdOverviewSchema } from "@purosur/contracts";
import {
  argentinaCalendarDay,
  type BuyerIdentificationThreshold,
  thresholdInEffectOn,
  thresholdScheduledAfter,
} from "@purosur/domain";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../access/backoffice-origin.js";
import {
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { DrizzleBuyerIdentificationThresholdReader } from "./drizzle-buyer-identification-threshold-reader.js";

export interface BuyerIdentificationThresholdsRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now?: () => Date;
}

export function registerBuyerIdentificationThresholdsListRoute<
  TQueryResult extends PgQueryResultHKT,
>(app: FastifyInstance, options: BuyerIdentificationThresholdsRouteOptions<TQueryResult>): void {
  const now = options.now ?? (() => new Date());
  const reader = new DrizzleBuyerIdentificationThresholdReader(options.db);
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.get(
    "/buyer-identification-thresholds",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: permissionAccess("change_fiscal_configuration"), sessionSource },
    },
    async (_request, reply) => {
      const thresholds = await reader.listBuyerIdentificationThresholds();
      const today = argentinaCalendarDay(now());
      await reply.code(200).send(
        buyerIdentificationThresholdOverviewSchema.parse({
          in_effect: wireThreshold(thresholdInEffectOn(thresholds, today)),
          scheduled: wireThreshold(thresholdScheduledAfter(thresholds, today)),
          latest_valid_from: thresholds[0]?.validFrom ?? null,
        }),
      );
    },
  );
}

function wireThreshold(threshold: BuyerIdentificationThreshold | undefined) {
  return threshold
    ? { id: threshold.id, amount: threshold.amount, valid_from: threshold.validFrom }
    : null;
}
