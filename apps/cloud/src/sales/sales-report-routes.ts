import {
  averageTicketSchema,
  manualDiscountsQuerySchema,
  manualDiscountsSchema,
  reportQuerySchema,
  salesByCashierSchema,
  salesByProductAndCategoryQuerySchema,
  salesByProductAndCategorySchema,
  salesByPromotionSchema,
  salesReportSchema,
} from "@purosur/contracts";
import type { ManualAdjustmentValue } from "@purosur/domain";
import {
  readAverageTicket,
  readManualDiscounts,
  readSalesByCashier,
  readSalesByDay,
  readSalesByProductAndCategory,
  readSalesByPromotion,
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
import { DrizzleManualDiscountsReportReader } from "./drizzle-manual-discounts-report-reader.js";
import { DrizzleProductSalesReportReader } from "./drizzle-product-sales-report-reader.js";
import { DrizzlePromotionSalesReportReader } from "./drizzle-promotion-sales-report-reader.js";
import { DrizzleSalesReportReader } from "./drizzle-sales-report-reader.js";

function adjustmentOnTheWire(adjustment: ManualAdjustmentValue): { kind: string; value: number } {
  switch (adjustment.kind) {
    case "PRICE":
      return { kind: adjustment.kind, value: adjustment.unitPrice };
    case "PERCENT":
      return { kind: adjustment.kind, value: adjustment.percent };
    case "AMOUNT":
      return { kind: adjustment.kind, value: adjustment.amount };
  }
}

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
  const promotionReader = new DrizzlePromotionSalesReportReader(options.db);
  const manualDiscountsReader = new DrizzleManualDiscountsReportReader(options.db);
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

  app.get("/reports/sales-by-promotion", { preHandler, config }, async (request, reply) => {
    const query = await readValidatedBody(reply, reportQuerySchema, request.query);
    if (!query) {
      return;
    }
    const report = await readSalesByPromotion(
      { reader: promotionReader, clock: { now } },
      {
        locationId: openSessionOf(request).locationId,
        asked: { from: query.from, to: query.to },
        registerId: query.register_id,
      },
    );
    await reply.code(200).send(
      salesByPromotionSchema.parse({
        range: report.range,
        rows: report.rows.map((row) => ({
          promotion_id: row.promotionId,
          name: row.name,
          terms: row.terms,
          lines: row.lines,
          units: row.units,
          thousandths: row.thousandths,
          discounted: row.discounted,
        })),
        totals: {
          discounted: report.totals.discounted,
          lines: report.totals.lines,
          most_used:
            report.totals.mostUsed === null
              ? null
              : {
                  promotion_id: report.totals.mostUsed.promotionId,
                  name: report.totals.mostUsed.name,
                  lines: report.totals.mostUsed.lines,
                },
        },
      }),
    );
  });

  app.get("/reports/manual-discounts", { preHandler, config }, async (request, reply) => {
    const query = await readValidatedBody(reply, manualDiscountsQuerySchema, request.query);
    if (!query) {
      return;
    }
    const report = await readManualDiscounts(
      { reader: manualDiscountsReader, clock: { now } },
      {
        locationId: openSessionOf(request).locationId,
        asked: { from: query.from, to: query.to },
        registerId: query.register_id,
        authorizedBy: query.authorized_by,
      },
    );
    const person = ({ id, name }: { id: string; name: string | null }) => ({ id, name });
    await reply.code(200).send(
      manualDiscountsSchema.parse({
        range: report.range,
        rows: report.rows.map((row) => ({
          kind: row.kind,
          sale_id: row.saleId,
          operation_number: row.operationNumber,
          line_id: row.lineId,
          completed_at: row.completedAt.toISOString(),
          product_name: row.productName,
          adjustment: adjustmentOnTheWire(row.adjustment),
          reason: row.reason,
          authorizer: person(row.authorizer),
          discounted: row.discounted,
        })),
        totals: {
          discounted: report.totals.discounted,
          count: report.totals.count,
          line_count: report.totals.lineCount,
          sale_count: report.totals.saleCount,
          most_authorized:
            report.totals.mostAuthorized === null
              ? null
              : {
                  ...person(report.totals.mostAuthorized),
                  count: report.totals.mostAuthorized.count,
                },
        },
        authorizers: report.authorizers.map(person),
      }),
    );
  });

  app.get("/reports/average-ticket", { preHandler, config }, async (request, reply) => {
    const query = await readValidatedBody(reply, reportQuerySchema, request.query);
    if (!query) {
      return;
    }
    const report = await readAverageTicket(
      { reader, clock: { now } },
      {
        locationId: openSessionOf(request).locationId,
        asked: { from: query.from, to: query.to },
        registerId: query.register_id,
      },
    );
    const ticketOf = ({ salesCount, total, averageTicket }: typeof report.current) => ({
      sales_count: salesCount,
      total,
      average_ticket: averageTicket,
    });
    await reply.code(200).send(
      averageTicketSchema.parse({
        range: report.range,
        previous_range: report.previousRange,
        current: ticketOf(report.current),
        previous: report.previous === null ? null : ticketOf(report.previous),
        change_tenths: report.changeTenths,
        weeks: report.weeks.map((week) => ({
          from: week.from,
          to: week.to,
          ...ticketOf(week),
        })),
      }),
    );
  });
}
