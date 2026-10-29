import { lossesByReasonReportQuerySchema, lossesByReasonReportSchema } from "@purosur/contracts";
import { readLossesByReasonReport } from "@purosur/domain/stock/use-cases";
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
import { DrizzleLossReader } from "./drizzle-loss-reader.js";
import type { StockRouteOptions } from "./stock-route-options.js";

export function registerLossesByReasonReportRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: StockRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const reader = new DrizzleLossReader(options.db);

  app.get(
    "/reports/losses-by-reason",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("reports_area"), sessionSource },
    },
    async (request, reply) => {
      const query = await readValidatedBody(reply, lossesByReasonReportQuerySchema, request.query);
      if (!query) {
        return;
      }
      const report = await readLossesByReasonReport(
        { reader, clock: { now }, zoneRules: options.zoneRules },
        {
          locationId: openSessionOf(request).locationId,
          asked: { from: query.from, to: query.to },
        },
      );
      await reply.code(200).send(
        lossesByReasonReportSchema.parse({
          range: report.range,
          reasons: report.reasons.map((group) => ({
            reason: group.reason,
            loss_count: group.lossCount,
            products: group.products.map((product) => ({
              id: product.id,
              name: product.name,
              brand_name: product.brandName,
              net_content: product.netContent,
              sale_unit: product.saleUnit,
              quantity: product.quantity,
              loss_count: product.lossCount,
            })),
          })),
        }),
      );
    },
  );
}
