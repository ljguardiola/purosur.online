import { discountCreationBodySchema, discountSummarySchema } from "@purosur/contracts";
import { createDiscount } from "@purosur/domain/pricing/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { backofficeOriginGuard } from "../access/backoffice-origin.js";
import {
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { type DiscountsRouteOptions, listDiscounts } from "./discounts-list-route.js";
import { DrizzleDiscountStore } from "./drizzle-discount-store.js";

export const DISCOUNT_TARGET_NOT_FOUND_RESPONSE = {
  code: "discount_target_not_found",
  message: "the product, category or tag the discount applies to does not exist or is deactivated",
} as const;

export function registerDiscountCreationRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: DiscountsRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const ports = { store: new DrizzleDiscountStore(options.db) };
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.post(
    "/discounts",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: { access: permissionAccess("manage_promotions"), sessionSource },
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

      const [created] = await listDiscounts(options.db, outcome.id);
      await reply.code(201).send(discountSummarySchema.parse(created));
    },
  );
}
