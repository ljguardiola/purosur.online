import { freightByPeriodQuerySchema, freightByPeriodSchema } from "@purosur/contracts";
import { readFreightByPeriod } from "@purosur/domain/purchasing/use-cases";
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
import { DrizzleFreightReportReader } from "./drizzle-freight-report-reader.js";
import type { PurchasingRouteOptions } from "./purchasing-route-options.js";

export function registerFreightByPeriodReportRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: PurchasingRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const reader = new DrizzleFreightReportReader(options.db);

  app.get(
    "/reports/freight-by-period",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("reports_area"), sessionSource },
    },
    async (request, reply) => {
      const query = await readValidatedBody(reply, freightByPeriodQuerySchema, request.query);
      if (!query) {
        return;
      }
      const report = await readFreightByPeriod(
        { reader, clock: { now }, zoneRules: options.zoneRules },
        {
          locationId: openSessionOf(request).locationId,
          asked: { from: query.from, to: query.to },
        },
      );
      await reply.code(200).send(
        freightByPeriodSchema.parse({
          range: report.range,
          months: report.months,
          totals: report.totals,
        }),
      );
    },
  );
}
