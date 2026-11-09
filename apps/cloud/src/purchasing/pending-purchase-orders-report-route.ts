import { pendingPurchaseOrdersQuerySchema, pendingPurchaseOrdersSchema } from "@purosur/contracts";
import { readPendingPurchaseOrders } from "@purosur/domain/purchasing/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  anyCapabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzlePendingPurchaseOrdersReader } from "./drizzle-pending-purchase-orders-reader.js";
import type { PurchasingRouteOptions } from "./purchasing-route-options.js";

export function registerPendingPurchaseOrdersReportRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: PurchasingRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const reader = new DrizzlePendingPurchaseOrdersReader(options.db);

  app.get(
    "/reports/pending-purchase-orders",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: {
        access: anyCapabilityAccess("reports_area", "purchase_order_reads"),
        sessionSource,
      },
    },
    async (request, reply) => {
      const query = await readValidatedBody(reply, pendingPurchaseOrdersQuerySchema, request.query);
      if (!query) {
        return;
      }
      const report = await readPendingPurchaseOrders(
        { reader, clock: { now }, zoneRules: options.zoneRules },
        {
          locationId: openSessionOf(request).locationId,
          asked: { from: query.from, to: query.to },
        },
      );
      await reply.code(200).send(
        pendingPurchaseOrdersSchema.parse({
          range: report.range,
          orders: report.orders.map((order) => ({
            id: order.id,
            supplier: order.supplier,
            state: order.state,
            sent_at: order.sentAt.toISOString(),
            line_count: order.lineCount,
            expected_total_cents: order.expectedTotalCents,
            has_unpriced_line: order.hasUnpricedLine,
          })),
          totals: {
            orders: report.totals.orders,
            suppliers: report.totals.suppliers,
            expected_total_cents: report.totals.expectedTotalCents,
            has_unpriced_line: report.totals.hasUnpricedLine,
          },
        }),
      );
    },
  );
}
