import {
  pricesPastReviewDeadlineReportQuerySchema,
  pricesPastReviewDeadlineReportSchema,
} from "@purosur/contracts";
import { readPricesPastReviewDeadlineReport } from "@purosur/domain/pricing/use-cases";
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
import { DrizzlePriceReviewReader } from "./drizzle-price-review-reader.js";
import type { PricesRouteOptions } from "./prices-list-route.js";

export function registerPricesPastReviewDeadlineReportRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: PricesRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const reviews = new DrizzlePriceReviewReader(options.db);

  app.get(
    "/reports/prices-past-review-deadline",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("reports_area"), sessionSource },
    },
    async (request, reply) => {
      const query = await readValidatedBody(
        reply,
        pricesPastReviewDeadlineReportQuerySchema,
        request.query,
      );
      if (!query) {
        return;
      }
      const report = await readPricesPastReviewDeadlineReport(
        { reviews, clock: { now }, zoneRules: options.zoneRules },
        {
          locationId: openSessionOf(request).locationId,
          asked: {
            ...(query.from === undefined ? {} : { from: query.from }),
            ...(query.to === undefined ? {} : { to: query.to }),
          },
        },
      );
      await reply.code(200).send(
        pricesPastReviewDeadlineReportSchema.parse({
          period: report.period,
          window_days: report.windowDays,
          prices: report.prices.map((price) => ({
            product: {
              id: price.product.id,
              name: price.product.name,
              brand_name: price.product.brandName,
              net_content: price.product.netContent,
              category_id: price.product.categoryId,
              category_name: price.product.categoryName,
              sale_unit: price.product.saleUnit,
            },
            current_price: price.currentPrice && {
              unit_price_cents: price.currentPrice.unitPrice,
              valid_from: price.currentPrice.validFrom.toISOString(),
            },
            last_reviewed_at: price.lastReviewedAt?.toISOString() ?? null,
            past_deadline_on: price.pastDeadlineOn,
            reason: price.reason,
          })),
          summary: { price_count: report.summary.priceCount },
        }),
      );
    },
  );
}
