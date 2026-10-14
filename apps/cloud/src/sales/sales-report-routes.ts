import {
  reportQuerySchema,
  salesByCashierSchema,
  salesByProductAndCategoryQuerySchema,
  salesByProductAndCategorySchema,
  salesReportSchema,
} from "@purosur/contracts";
import {
  readSalesByCashier,
  readSalesByDay,
  readSalesByProductAndCategory,
} from "@purosur/domain/sales/use-cases";
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
import { DrizzleCashierSalesReportReader } from "./drizzle-cashier-sales-report-reader.js";
import { DrizzleProductSalesReportReader } from "./drizzle-product-sales-report-reader.js";
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
  const productReader = new DrizzleProductSalesReportReader(options.db);
  const cashierReader = new DrizzleCashierSalesReportReader(options.db);
  const preHandler = sameOriginGuard(options.backofficeOrigin);
  const config = { access: capabilityAccess("reports_area"), sessionSource };

  app.get("/reports/sales-by-day", { preHandler, config }, async (request, reply) => {
    const query = await readValidatedBody(reply, reportQuerySchema, request.query);
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

  app.get(
    "/reports/sales-by-product-and-category",
    { preHandler, config },
    async (request, reply) => {
      const query = await readValidatedBody(
        reply,
        salesByProductAndCategoryQuerySchema,
        request.query,
      );
      if (!query) {
        return;
      }
      const report = await readSalesByProductAndCategory(
        { reader: productReader, clock: { now } },
        {
          locationId: openSessionOf(request).locationId,
          asked: { from: query.from, to: query.to },
          registerId: query.register_id,
          group: query.group,
        },
      );
      await reply.code(200).send(salesByProductAndCategorySchema.parse(report));
    },
  );

  app.get("/reports/sales-by-cashier", { preHandler, config }, async (request, reply) => {
    const query = await readValidatedBody(reply, reportQuerySchema, request.query);
    if (!query) {
      return;
    }
    const report = await readSalesByCashier(
      { reader: cashierReader, clock: { now } },
      {
        locationId: openSessionOf(request).locationId,
        asked: { from: query.from, to: query.to },
        registerId: query.register_id,
      },
    );
    await reply.code(200).send(
      salesByCashierSchema.parse({
        range: report.range,
        rows: report.rows.map((row) => ({
          cashier_id: row.cashierId,
          name: row.name,
          sessions: row.sessions,
          sales_count: row.salesCount,
          total: row.total,
          average_ticket: row.averageTicket,
        })),
        totals: {
          cashiers: report.totals.cashiers,
          sales_count: report.totals.salesCount,
          total: report.totals.total,
          average_ticket: report.totals.averageTicket,
        },
      }),
    );
  });
}
