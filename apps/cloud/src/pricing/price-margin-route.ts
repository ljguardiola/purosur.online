import { priceMarginQuerySchema, priceMarginSchema } from "@purosur/contracts";
import { readPriceMargin } from "@purosur/domain/pricing/use-cases";
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
import { DrizzlePriceCostReader } from "./drizzle-price-cost-reader.js";
import type { PricesRouteOptions } from "./prices-list-route.js";

const NOT_FOUND_RESPONSE = { code: "not_found", message: "no product with that id" } as const;

export function registerPriceMarginRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: PricesRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  const ports = { costs: new DrizzlePriceCostReader(options.db) };
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.get(
    "/prices/:productId/margin",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("prices_area"), sessionSource },
    },
    async (request, reply) => {
      const ids = await readRecordIds(reply, request.params, ["productId"]);
      if (!ids) {
        return;
      }
      const query = await readValidatedBody(reply, priceMarginQuerySchema, request.query);
      if (!query) {
        return;
      }

      const outcome = await readPriceMargin(ports, {
        locationId: openSessionOf(request).locationId,
        productId: ids.productId,
        unitPrice: query.unitPrice,
      });

      if (outcome.kind === "not_found") {
        await reply.code(404).send(NOT_FOUND_RESPONSE);
        return;
      }
      await reply.code(200).send(priceMarginSchema.parse({ costReference: outcome.costReference }));
    },
  );
}
