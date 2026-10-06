import { discountCreationBodySchema, discountSummarySchema } from "@purosur/contracts";
import { createDiscount, readDiscount } from "@purosur/domain/pricing/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { backofficeOriginGuard } from "../access/backoffice-origin.js";
import {
  capabilityAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import type { DiscountsRouteOptions } from "./discounts-list-route.js";
import { DrizzleDiscountReader } from "./drizzle-discount-reader.js";
import { DrizzleDiscountStore } from "./drizzle-discount-store.js";

export const DISCOUNT_TARGET_NOT_FOUND_RESPONSE = {
  code: "discount_target_not_found",
  message: "the product, category or tag the discount applies to does not exist or is deactivated",
} as const;

export const DISCOUNT_TARGET_NOT_SOLD_BY_UNIT_RESPONSE = {
  code: "discount_target_not_sold_by_unit",
  message: "a buy-N-pay-M discount applies only to a product sold by the unit",
} as const;

export function registerDiscountCreationRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: DiscountsRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const ports = { store: new DrizzleDiscountStore(options.db) };
  const reading = { discounts: new DrizzleDiscountReader(options.db), clock: { now } };
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.post(
    "/discounts",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("promotions"), sessionSource },
    },
    async (request, reply) => {
      const parsedBody = await readValidatedBody(reply, discountCreationBodySchema, request.body);
      if (!parsedBody) {
        return;
      }

      const outcome = await createDiscount(ports, parsedBody);

      if (outcome.kind === "target_not_found") {
        await reply.code(409).send(DISCOUNT_TARGET_NOT_FOUND_RESPONSE);
        return;
      }
      if (outcome.kind === "target_not_sold_by_unit") {
        await reply.code(409).send(DISCOUNT_TARGET_NOT_SOLD_BY_UNIT_RESPONSE);
        return;
      }

      const created = await readDiscount(reading, outcome.id);
      if (created.kind === "not_found") {
        throw new Error(`discount ${outcome.id} was created and cannot be read`);
      }
      await reply.code(201).send(discountSummarySchema.parse(created.discount));
    },
  );
}
