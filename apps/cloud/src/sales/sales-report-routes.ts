import {
  reportRegisterListSchema,
  salesReportQuerySchema,
  salesReportSchema,
} from "@purosur/contracts";
import { readSalesByDay } from "@purosur/domain/sales/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { DrizzleBranchRegisterStore } from "../register/drizzle-branch-register-store.js";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleSalesReportReader } from "./drizzle-sales-report-reader.js";

export interface SalesReportRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
}

export function registerSalesReportRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: SalesReportRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const reader = new DrizzleSalesReportReader(options.db);
  const branchRegisters = new DrizzleBranchRegisterStore(options.db, now);
  const preHandler = sameOriginGuard(options.backofficeOrigin);
  const config = { access: capabilityAccess("reports_area"), sessionSource };

  app.get("/reports/sales-by-day", { preHandler, config }, async (request, reply) => {
    const query = await readValidatedBody(reply, salesReportQuerySchema, request.query);
    if (!query) {
      return;
    }
    const report = await readSalesByDay(
      { reader, clock: { now } },
      {
        locationId: openSessionOf(request).locationId,
        asked: { from: query.from, to: query.to },
        registerId: query.register_id,
      },
    );
    await reply.code(200).send(
      salesReportSchema.parse({
        range: report.range,
        days: report.days.map(({ day, salesCount, total }) => ({
          day,
          sales_count: salesCount,
          total,
        })),
        totals: { sales_count: report.totals.salesCount, total: report.totals.total },
      }),
    );
  });

  app.get("/reports/registers", { preHandler, config }, async (request, reply) => {
    const registers = await branchRegisters.branchRegisters(openSessionOf(request).locationId);
    await reply.code(200).send(
      reportRegisterListSchema.parse({
        registers: registers.map(({ id, name }) => ({ id, name })),
      }),
    );
  });
}
