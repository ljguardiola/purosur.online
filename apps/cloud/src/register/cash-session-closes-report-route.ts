import { cashSessionClosesSchema, reportQuerySchema } from "@purosur/contracts";
import { readCashSessionCloses } from "@purosur/domain/register/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleCashSessionClosesReader } from "./drizzle-cash-session-closes-reader.js";

export interface CashSessionClosesReportRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
}

export function registerCashSessionClosesReportRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: CashSessionClosesReportRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const reader = new DrizzleCashSessionClosesReader(options.db);

  app.get(
    "/reports/cash-session-closes",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("reports_area"), sessionSource },
    },
    async (request, reply) => {
      const query = await readValidatedBody(reply, reportQuerySchema, request.query);
      if (!query) {
        return;
      }
      const report = await readCashSessionCloses(
        { reader, clock: { now } },
        {
          locationId: openSessionOf(request).locationId,
          asked: { from: query.from, to: query.to },
          registerId: query.register_id,
        },
      );
      await reply.code(200).send(
        cashSessionClosesSchema.parse({
          range: report.range,
          totals: {
            sessions: report.totals.sessions,
            net_difference: report.totals.netDifference,
            with_difference: report.totals.withDifference,
            cashiers: report.totals.cashiersWithDifference.map((cashier) => ({
              cashier_id: cashier.cashierId,
              cashier_name: cashier.cashierName,
              sessions: cashier.sessions,
            })),
          },
          sessions: report.closes.map((close) => ({
            id: close.id,
            closed_at: close.closedAt.toISOString(),
            register_id: close.registerId,
            register_name: close.registerName,
            cashier_id: close.cashierId,
            cashier_name: close.cashierName,
            closed_by_id: close.closedById,
            closed_by_name: close.closedByName,
            expected_cash: close.expectedCash,
            counted_cash: close.countedCash,
            difference: close.difference,
            has_difference: close.hasDifference,
          })),
        }),
      );
    },
  );
}
