import {
  goodConditionReturnDaysBodySchema,
  supplierPriceListDailyCapBodySchema,
} from "@purosur/contracts";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  anyCapabilityAccess,
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import type { BranchSettingsRouteOptions } from "./branch-settings-read-route.js";
import { DrizzleBranchSettingsReader } from "./drizzle-branch-settings-reader.js";

export function registerBranchTermsReadRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: BranchSettingsRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const reader = new DrizzleBranchSettingsReader(options.db);
  const preHandler = sameOriginGuard(options.backofficeOrigin);

  app.get(
    "/locations/current/good-condition-return-days",
    {
      preHandler,
      config: { access: anyCapabilityAccess("refunds_area", "returns_report"), sessionSource },
    },
    async (request, reply) => {
      const settings = await reader.currentBranchSettings(openSessionOf(request).locationId);
      await reply.code(200).send(
        goodConditionReturnDaysBodySchema.parse({
          good_condition_return_days: settings.goodConditionReturnDays,
        }),
      );
    },
  );

  app.get(
    "/locations/current/supplier-price-list-daily-cap",
    { preHandler, config: { access: capabilityAccess("supplier_price_lists"), sessionSource } },
    async (request, reply) => {
      const settings = await reader.currentBranchSettings(openSessionOf(request).locationId);
      await reply.code(200).send(
        supplierPriceListDailyCapBodySchema.parse({
          supplier_price_list_daily_extraction_cap: settings.supplierPriceListDailyExtractionCap,
        }),
      );
    },
  );
}
