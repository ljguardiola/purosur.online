import { currentStockReportQuerySchema, currentStockReportSchema } from "@purosur/contracts";
import { readCurrentStockReport } from "@purosur/domain/stock/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleStockReader } from "./drizzle-stock-reader.js";
import type { StockRouteOptions } from "./stock-route-options.js";

export function registerCurrentStockReportRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: StockRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const reader = new DrizzleStockReader(options.db);

  app.get(
    "/reports/current-stock",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("reports_area"), sessionSource },
    },
    async (request, reply) => {
      const query = await readValidatedBody(reply, currentStockReportQuerySchema, request.query);
      if (!query) {
        return;
      }
      const report = await readCurrentStockReport(
        { currentStock: reader },
        {
          locationId: openSessionOf(request).locationId,
          ...(query.category_id === undefined ? {} : { categoryId: query.category_id }),
        },
      );
      await reply.code(200).send(
        currentStockReportSchema.parse({
          products: report.products.map((product) => ({
            id: product.id,
            name: product.name,
            category_id: product.categoryId,
            category_name: product.categoryName,
            sale_unit: product.saleUnit,
            balance: product.balance,
            value_cents: product.valueCents,
            lots: product.lots.map((lot) => ({
              id: lot.id,
              lot_number: lot.lotNumber,
              expires_on: lot.expiresOn,
              technical: lot.technical,
              remaining: lot.remaining,
              unit_cost_cents: lot.unitCostCents,
              value_cents: lot.valueCents,
            })),
          })),
          categories: report.categories,
          summary: {
            value_cents: report.summary.valueCents,
            product_count: report.summary.productCount,
            negative_balance_count: report.summary.negativeBalanceCount,
            without_cost_count: report.summary.withoutCostCount,
          },
        }),
      );
    },
  );
}
