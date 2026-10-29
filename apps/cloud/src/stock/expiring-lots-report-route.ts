import { expiringLotsReportQuerySchema, expiringLotsReportSchema } from "@purosur/contracts";
import { readExpiringLotsReport } from "@purosur/domain/stock/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { DrizzleBranchSettingsReader } from "../branch/drizzle-branch-settings-reader.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleExpiringLotReader } from "./drizzle-expiring-lot-reader.js";
import type { StockRouteOptions } from "./stock-route-options.js";

export function registerExpiringLotsReportRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: StockRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const expiringLots = new DrizzleExpiringLotReader(options.db);
  const branchSettings = new DrizzleBranchSettingsReader(options.db);

  app.get(
    "/reports/expiring-lots",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("reports_area"), sessionSource },
    },
    async (request, reply) => {
      const query = await readValidatedBody(reply, expiringLotsReportQuerySchema, request.query);
      if (!query) {
        return;
      }
      const report = await readExpiringLotsReport(
        { expiringLots, branchSettings, clock: { now }, zoneRules: options.zoneRules },
        {
          locationId: openSessionOf(request).locationId,
          asked: {
            ...(query.from === undefined ? {} : { from: query.from }),
            ...(query.to === undefined ? {} : { to: query.to }),
          },
        },
      );
      await reply.code(200).send(
        expiringLotsReportSchema.parse({
          period: report.period,
          window_days: report.windowDays,
          lots: report.lots.map((lot) => ({
            id: lot.id,
            lot_number: lot.lotNumber,
            expires_on: lot.expiresOn,
            remaining: lot.remaining,
            value_cents: lot.valueCents,
            expired: lot.expired,
            days_to_expiry: lot.daysToExpiry,
            product: {
              id: lot.product.id,
              name: lot.product.name,
              brand_name: lot.product.brandName,
              net_content: lot.product.netContent,
              category_id: lot.product.categoryId,
              category_name: lot.product.categoryName,
              sale_unit: lot.product.saleUnit,
            },
          })),
          summary: {
            lot_count: report.summary.lotCount,
            value_cents: report.summary.valueCents,
            without_cost_count: report.summary.withoutCostCount,
          },
        }),
      );
    },
  );
}
