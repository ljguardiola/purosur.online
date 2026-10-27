import { supplierPriceComparisonSchema } from "@purosur/contracts";
import { listSupplierPriceComparison } from "@purosur/domain/purchasing/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleSupplierPriceComparisonReader } from "./drizzle-supplier-price-comparison-reader.js";
import type { PurchasingRouteOptions } from "./purchasing-route-options.js";

export function registerSupplierPriceComparisonRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: PurchasingRouteOptions<TQueryResult>,
): void {
  registerRouteAccess(app);
  const reader = new DrizzleSupplierPriceComparisonReader(options.db);
  const sessionSource = routeSessionSource({ db: options.db, now: options.now });
  const readGuard = {
    preHandler: sameOriginGuard(options.backofficeOrigin),
    config: { access: capabilityAccess("price_comparison"), sessionSource },
  };

  app.get("/supplier-price-comparison", readGuard, async (_request, reply) => {
    const products = await listSupplierPriceComparison(reader);
    await reply.code(200).send(
      supplierPriceComparisonSchema.parse({
        products: products.map((product) => ({
          ...product,
          offers: product.offers.map((offer) => ({
            ...offer,
            pricePerSaleUnit: {
              numerator: offer.pricePerSaleUnit.numerator.toString(),
              denominator: offer.pricePerSaleUnit.denominator.toString(),
            },
          })),
        })),
      }),
    );
  });
}
