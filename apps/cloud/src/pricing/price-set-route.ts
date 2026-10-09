import { priceSetBodySchema } from "@purosur/contracts";
import { setPrice } from "@purosur/domain/pricing/use-cases";
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
import { DrizzlePricingStore } from "./drizzle-pricing-store.js";
import type { PricesRouteOptions } from "./prices-list-route.js";

const NOT_FOUND_RESPONSE = { code: "not_found", message: "no product with that id" } as const;
const STALE_PRICE_RESPONSE = {
  code: "stale_price",
  message: "this product's price was changed since it was loaded",
} as const;
const PRICE_UNCHANGED_RESPONSE = {
  code: "price_unchanged",
  message: "the new price is the same as the current one; confirm it instead of changing it",
  details: [{ field: "unitPrice" }],
} as const;

export function registerPriceSetRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: PricesRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  const ports = { store: new DrizzlePricingStore(options.db, now), clock: { now } };
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.put(
    "/prices/:productId",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("prices_area"), sessionSource },
    },
    async (request, reply) => {
      const ids = await readRecordIds(reply, request.params, ["productId"]);
      if (!ids) {
        return;
      }
      const body = await readValidatedBody(reply, priceSetBodySchema, request.body);
      if (!body) {
        return;
      }

      const openSession = openSessionOf(request);

      const outcome = await setPrice(ports, {
        productId: ids.productId,
        locationId: openSession.locationId,
        unitPrice: body.unitPrice,
        expectedCurrentPriceId: body.expectedCurrentPriceId,
        actorId: openSession.userId,
      });

      if (outcome.kind === "not_found") {
        await reply.code(404).send(NOT_FOUND_RESPONSE);
        return;
      }
      if (outcome.kind === "stale_price") {
        await reply.code(409).send(STALE_PRICE_RESPONSE);
        return;
      }
      if (outcome.kind === "price_unchanged") {
        await reply.code(400).send(PRICE_UNCHANGED_RESPONSE);
        return;
      }

      await reply.code(200).send({ price: outcome.price, lastReviewedAt: outcome.lastReviewedAt });
    },
  );
}
