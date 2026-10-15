import {
  handConfirmedPaymentsQuerySchema,
  handConfirmedPaymentsSchema,
  reportQuerySchema,
  salesByPaymentMethodSchema,
} from "@purosur/contracts";
import {
  readHandConfirmedPayments,
  readSalesByPaymentMethod,
} from "@purosur/domain/payments/use-cases";
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
import { DrizzleHandConfirmedPaymentsReader } from "./drizzle-hand-confirmed-payments-reader.js";
import { DrizzlePaymentsReportReader } from "./drizzle-payments-report-reader.js";

export interface PaymentsReportRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
}

export function registerPaymentsReportRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: PaymentsReportRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const reader = new DrizzlePaymentsReportReader(options.db);
  const handConfirmedReader = new DrizzleHandConfirmedPaymentsReader(options.db);

  app.get(
    "/reports/sales-by-payment-method",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("reports_area"), sessionSource },
    },
    async (request, reply) => {
      const query = await readValidatedBody(reply, reportQuerySchema, request.query);
      if (!query) {
        return;
      }
      const report = await readSalesByPaymentMethod(
        { reader, clock: { now } },
        {
          locationId: openSessionOf(request).locationId,
          asked: { from: query.from, to: query.to },
          registerId: query.register_id,
        },
      );
      await reply.code(200).send(
        salesByPaymentMethodSchema.parse({
          range: report.range,
          methods: report.methods.map(({ method, salesCount, amount }) => ({
            method,
            sales_count: salesCount,
            amount,
          })),
          totals: {
            sales_count: report.totals.salesCount,
            total: report.totals.total,
            average_ticket: report.totals.averageTicket,
          },
        }),
      );
    },
  );

  app.get(
    "/reports/hand-confirmed-payments",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("reports_area"), sessionSource },
    },
    async (request, reply) => {
      const query = await readValidatedBody(reply, handConfirmedPaymentsQuerySchema, request.query);
      if (!query) {
        return;
      }
      const report = await readHandConfirmedPayments(
        { reader: handConfirmedReader, clock: { now } },
        {
          locationId: openSessionOf(request).locationId,
          asked: { from: query.from, to: query.to },
          registerId: query.register_id,
          method: query.method,
        },
      );
      const methods = (totals: typeof report.methods) =>
        totals.map(({ method, count, amount }) => ({ method, count, amount }));
      await reply.code(200).send(
        handConfirmedPaymentsSchema.parse({
          range: report.range,
          totals: report.totals,
          methods: methods(report.methods),
          cashiers: report.cashiers.map((cashier) => ({
            cashier_id: cashier.cashierId,
            cashier_name: cashier.cashierName,
            count: cashier.count,
            amount: cashier.amount,
            methods: methods(cashier.methods),
          })),
          payments: report.payments.map((payment) => ({
            id: payment.id,
            method: payment.method,
            amount: payment.amount,
            confirmed_at: payment.confirmedAt.toISOString(),
            cashier_name: payment.cashierName,
            confirmed_by_name: payment.confirmedByName,
            sale_operation_number: payment.saleOperationNumber,
          })),
        }),
      );
    },
  );
}
