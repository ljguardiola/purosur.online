import { orderSuggestionSchema } from "@purosur/contracts";
import { listOrderSuggestion } from "@purosur/domain/purchasing/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleOrderSuggestionReader } from "./drizzle-order-suggestion-reader.js";
import type { PurchasingRouteOptions } from "./purchasing-route-options.js";

export function registerOrderSuggestionRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: PurchasingRouteOptions<TQueryResult>,
): void {
  registerRouteAccess(app);
  const reader = new DrizzleOrderSuggestionReader(options.db);
  const sessionSource = routeSessionSource({ db: options.db, now: options.now });
  const readGuard = {
    preHandler: sameOriginGuard(options.backofficeOrigin),
    config: { access: capabilityAccess("price_comparison"), sessionSource },
  };

  app.get("/order-suggestion", readGuard, async (request, reply) => {
    const lines = await listOrderSuggestion(
      { reader, clock: { now: options.now }, zoneRules: options.zoneRules },
      { locationId: openSessionOf(request).locationId },
    );
    await reply.code(200).send(
      orderSuggestionSchema.parse({
        lines: lines.map((line) => ({
          ...line,
          offers: line.offers.map((offer) => ({
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
