import { aiCostByPeriodQuerySchema, aiCostByPeriodSchema } from "@purosur/contracts";
import { readAiCostByPeriod } from "@purosur/domain/purchasing/use-cases";
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
import { DrizzleAiCostReportReader } from "./drizzle-ai-cost-report-reader.js";
import type { PurchasingRouteOptions } from "./purchasing-route-options.js";

export function registerAiCostByPeriodReportRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: PurchasingRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const reader = new DrizzleAiCostReportReader(options.db);

  app.get(
    "/reports/ai-cost-by-period",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("branch_area"), sessionSource },
    },
    async (request, reply) => {
      const query = await readValidatedBody(reply, aiCostByPeriodQuerySchema, request.query);
      if (!query) {
        return;
      }
      const report = await readAiCostByPeriod(
        { reader, clock: { now }, zoneRules: options.zoneRules },
        {
          locationId: openSessionOf(request).locationId,
          asked: { from: query.from, to: query.to },
          groupBy: query.group_by,
        },
      );
      await reply.code(200).send(
        aiCostByPeriodSchema.parse({
          range: report.range,
          groups: report.groups,
          total: report.total,
        }),
      );
    },
  );
}
