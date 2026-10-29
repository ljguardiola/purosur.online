import { purchasesBySupplierQuerySchema, purchasesBySupplierSchema } from "@purosur/contracts";
import { readPurchasesBySupplier } from "@purosur/domain/purchasing/use-cases";
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
import { DrizzlePurchasesReportReader } from "./drizzle-purchases-report-reader.js";
import type { PurchasingRouteOptions } from "./purchasing-route-options.js";

export function registerPurchasesBySupplierReportRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: PurchasingRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const reader = new DrizzlePurchasesReportReader(options.db);

  app.get(
    "/reports/purchases-by-supplier",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("reports_area"), sessionSource },
    },
    async (request, reply) => {
      const query = await readValidatedBody(reply, purchasesBySupplierQuerySchema, request.query);
      if (!query) {
        return;
      }
      const report = await readPurchasesBySupplier(
        { reader, clock: { now }, zoneRules: options.zoneRules },
        {
          locationId: openSessionOf(request).locationId,
          asked: { from: query.from, to: query.to },
        },
      );
      await reply.code(200).send(
        purchasesBySupplierSchema.parse({
          range: report.range,
          suppliers: report.suppliers.map((supplier) => ({
            supplier_id: supplier.supplierId,
            name: supplier.name,
            months: supplier.months,
            purchases: supplier.purchases,
            amount: supplier.amount,
          })),
          totals: report.totals,
        }),
      );
    },
  );
}
