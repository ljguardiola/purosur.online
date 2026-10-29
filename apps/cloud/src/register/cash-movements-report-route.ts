import { cashMovementsSchema, reportQuerySchema } from "@purosur/contracts";
import type { ZoneRulesSource } from "@purosur/domain";
import { readCashMovements } from "@purosur/domain/register/use-cases";
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
import { DrizzleCashMovementsReader } from "./drizzle-cash-movements-reader.js";

export interface CashMovementsReportRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
  zoneRules: ZoneRulesSource;
}

export function registerCashMovementsReportRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: CashMovementsReportRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const reader = new DrizzleCashMovementsReader(options.db);

  app.get(
    "/reports/cash-movements",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("reports_area"), sessionSource },
    },
    async (request, reply) => {
      const query = await readValidatedBody(reply, reportQuerySchema, request.query);
      if (!query) {
        return;
      }
      const report = await readCashMovements(
        { reader, clock: { now }, zoneRules: options.zoneRules },
        {
          locationId: openSessionOf(request).locationId,
          asked: { from: query.from, to: query.to },
          registerId: query.register_id,
        },
      );
      await reply.code(200).send(
        cashMovementsSchema.parse({
          range: report.range,
          totals: {
            cash_in: report.totals.CASH_IN,
            cash_out: report.totals.CASH_OUT,
            withdrawal: report.totals.WITHDRAWAL,
          },
          movements: report.movements.map((movement) => ({
            id: movement.id,
            occurred_at: movement.occurredAt.toISOString(),
            kind: movement.kind,
            reason: movement.reason,
            amount: movement.amount,
            session_id: movement.sessionId,
            register_name: movement.registerName,
            session_opened_at: movement.sessionOpenedAt.toISOString(),
          })),
        }),
      );
    },
  );
}
