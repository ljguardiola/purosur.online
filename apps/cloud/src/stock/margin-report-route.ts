import { marginReportQuerySchema, marginReportSchema } from "@purosur/contracts";
import { readMarginReport } from "@purosur/domain/stock/use-cases";
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
import { DrizzleSaleMarginReportReader } from "./drizzle-sale-margin-report-reader.js";
import type { StockRouteOptions } from "./stock-route-options.js";

export function registerMarginReportRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: StockRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const reader = new DrizzleSaleMarginReportReader(options.db);

  app.get(
    "/reports/margin",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("reports_area"), sessionSource },
    },
    async (request, reply) => {
      const query = await readValidatedBody(reply, marginReportQuerySchema, request.query);
      if (!query) {
        return;
      }
      const report = await readMarginReport(
        { reader, clock: { now }, zoneRules: options.zoneRules },
        {
          locationId: openSessionOf(request).locationId,
          asked: { from: query.from, to: query.to },
          registerId: query.register_id,
          group: query.group,
        },
      );
      await reply.code(200).send(marginReportSchema.parse(report));
    },
  );
}
