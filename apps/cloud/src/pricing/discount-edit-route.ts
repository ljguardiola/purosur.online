import { discountEditBodySchema, discountSummarySchema } from "@purosur/contracts";
import { editDiscount } from "@purosur/domain/pricing/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { backofficeOriginGuard } from "../access/backoffice-origin.js";
import {
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { discounts } from "../platform/db/schema.js";
import { UUID_PATTERN } from "../platform/db/uuid-pattern.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import {
  DISCOUNT_TARGET_NOT_FOUND_RESPONSE,
  DISCOUNT_TARGET_NOT_SOLD_BY_UNIT_RESPONSE,
} from "./discount-creation-route.js";
import { type DiscountsRouteOptions, listDiscounts } from "./discounts-list-route.js";
import { DrizzleDiscountStore } from "./drizzle-discount-store.js";

const NOT_FOUND_RESPONSE = { code: "not_found", message: "no discount with that id" } as const;

const DISCOUNT_PRODUCT_SOLD_BY_WEIGHT_RESPONSE = {
  code: "discount_product_sold_by_weight",
  message: "a buy-N-pay-M discount cannot be live while its product is sold by weight",
} as const;

const STALE_VERSION_RESPONSE = {
  code: "stale_version",
  message: "this discount was changed since it was loaded",
} as const;

async function discountExists<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  id: string,
): Promise<boolean> {
  if (!UUID_PATTERN.test(id)) {
    return false;
  }
  const [discount] = await db
    .select({ id: discounts.id })
    .from(discounts)
    .where(eq(discounts.id, id));
  return discount !== undefined;
}

export function registerDiscountEditRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: DiscountsRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const ports = { store: new DrizzleDiscountStore(options.db), clock: { now } };
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.put<{ Params: { id: string } }>(
    "/discounts/:id",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: { access: permissionAccess("manage_promotions"), sessionSource },
    },
    async (request, reply) => {
      const { id } = request.params;
      if (!(await discountExists(options.db, id))) {
        await reply.code(404).send(NOT_FOUND_RESPONSE);
        return;
      }

      const parsedBody = await readValidatedBody(reply, discountEditBodySchema, request.body);
      if (!parsedBody) {
        return;
      }

      const outcome = await editDiscount(ports, { id, ...parsedBody });

      if (outcome.kind === "not_found") {
        await reply.code(404).send(NOT_FOUND_RESPONSE);
        return;
      }
      if (outcome.kind === "stale_version") {
        await reply.code(409).send(STALE_VERSION_RESPONSE);
        return;
      }
      if (outcome.kind === "target_not_found") {
        await reply.code(409).send(DISCOUNT_TARGET_NOT_FOUND_RESPONSE);
        return;
      }
      if (outcome.kind === "target_not_sold_by_unit") {
        await reply.code(409).send(DISCOUNT_TARGET_NOT_SOLD_BY_UNIT_RESPONSE);
        return;
      }
      if (outcome.kind === "product_sold_by_weight") {
        await reply
          .code(409)
          .send({ ...DISCOUNT_PRODUCT_SOLD_BY_WEIGHT_RESPONSE, productName: outcome.productName });
        return;
      }

      const [edited] = await listDiscounts(options.db, id);
      await reply.code(200).send(discountSummarySchema.parse(edited));
    },
  );
}
