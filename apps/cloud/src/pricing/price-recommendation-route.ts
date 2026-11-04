import { priceRecommendationQuerySchema, priceRecommendationSchema } from "@purosur/contracts";
import { readPriceRecommendation } from "@purosur/domain/pricing/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { readRecordIds } from "../platform/record-id-params.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleAssemblyBatchCostReader } from "../stock/drizzle-assembly-batch-cost-reader.js";
import { DrizzleActiveProductReader } from "./drizzle-active-product-reader.js";
import { DrizzleCurrentPriceReader } from "./drizzle-current-price-reader.js";
import type { PricesRouteOptions } from "./prices-list-route.js";

const NOT_FOUND_RESPONSE = { code: "not_found", message: "no product with that id" } as const;

export function registerPriceRecommendationRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: PricesRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  const ports = {
    products: new DrizzleActiveProductReader(options.db),
    currentPrices: new DrizzleCurrentPriceReader(options.db),
    batchCosts: new DrizzleAssemblyBatchCostReader(options.db),
    zoneRules: options.zoneRules,
  };
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.get(
    "/prices/:productId/recommendation",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("recipes"), sessionSource },
    },
    async (request, reply) => {
      const ids = await readRecordIds(reply, request.params, ["productId"]);
      if (!ids) {
        return;
      }
      const query = await readValidatedBody(reply, priceRecommendationQuerySchema, request.query);
      if (!query) {
        return;
      }

      const outcome = await readPriceRecommendation(ports, {
        locationId: openSessionOf(request).locationId,
        productId: ids.productId,
        components: query.components,
        unitPrice: query.unitPrice ?? null,
      });

      if (outcome.kind === "not_found") {
        await reply.code(404).send(NOT_FOUND_RESPONSE);
        return;
      }
      const { kind: _kind, ...answer } = outcome;
      await reply.code(200).send(
        priceRecommendationSchema.parse({
          ...answer,
          currentPrice: answer.currentPrice && {
            ...answer.currentPrice,
            validFrom: answer.currentPrice.validFrom.toISOString(),
          },
        }),
      );
    },
  );
}
