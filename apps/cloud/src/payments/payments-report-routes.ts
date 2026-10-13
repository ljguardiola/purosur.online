import { reportQuerySchema, salesByPaymentMethodSchema } from "@purosur/contracts";
import { readSalesByPaymentMethod } from "@purosur/domain/payments/use-cases";
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
}
