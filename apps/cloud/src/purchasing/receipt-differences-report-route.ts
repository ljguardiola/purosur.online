import { receiptDifferencesQuerySchema, receiptDifferencesSchema } from "@purosur/contracts";
import { readReceiptDifferences } from "@purosur/domain/purchasing/use-cases";
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
import { DrizzleReceiptDifferencesReader } from "./drizzle-receipt-differences-reader.js";
import type { PurchasingRouteOptions } from "./purchasing-route-options.js";

export function registerReceiptDifferencesReportRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: PurchasingRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const reader = new DrizzleReceiptDifferencesReader(options.db);

  app.get(
    "/reports/receipt-differences",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("reports_area"), sessionSource },
    },
    async (request, reply) => {
      const query = await readValidatedBody(reply, receiptDifferencesQuerySchema, request.query);
      if (!query) {
        return;
      }
      const report = await readReceiptDifferences(
        { reader, clock: { now }, zoneRules: options.zoneRules },
        {
          locationId: openSessionOf(request).locationId,
          asked: { from: query.from, to: query.to },
        },
      );
      await reply.code(200).send(
        receiptDifferencesSchema.parse({
          range: report.range,
          suppliers: report.suppliers.map((supplier) => ({
            supplier_id: supplier.supplierId,
            name: supplier.name,
            short_lines: supplier.shortLines,
            price_difference_lines: supplier.priceDifferenceLines,
            price_difference_cents: supplier.priceDifferenceCents,
            months: supplier.months.map((month) => ({
              month: month.month,
              short_lines: month.shortLines,
              price_difference_lines: month.priceDifferenceLines,
              price_difference_cents: month.priceDifferenceCents,
              lines: month.lines.map((line) => ({
                receipt_id: line.receiptId,
                order_id: line.orderId,
                received_on: line.receivedOn,
                product: line.product,
                received_quantity: line.receivedQuantity,
                missing_quantity: line.missingQuantity,
                price_difference_cents: line.priceDifferenceCents,
              })),
            })),
          })),
          totals: {
            suppliers: report.totals.suppliers,
            short_lines: report.totals.shortLines,
            price_difference_lines: report.totals.priceDifferenceLines,
            price_difference_cents: report.totals.priceDifferenceCents,
          },
        }),
      );
    },
  );
}
