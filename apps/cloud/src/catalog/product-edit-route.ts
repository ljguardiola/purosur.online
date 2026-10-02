import { productEditBodySchema, productSummarySchema } from "@purosur/contracts";
import { editProduct } from "@purosur/domain/catalog/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { backofficeOriginGuard } from "../access/backoffice-origin.js";
import {
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { products } from "../platform/db/schema.js";
import { UUID_PATTERN } from "../platform/db/uuid-pattern.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { DrizzleCatalogStore } from "./drizzle-catalog-store.js";
import {
  BRAND_INACTIVE_RESPONSE,
  BRAND_NOT_FOUND_FAILURE,
  CATEGORY_NOT_FOUND_FAILURE,
  CATEGORY_NOT_LEAF_RESPONSE,
  TAG_INACTIVE_RESPONSE,
  TAG_NOT_FOUND_FAILURE,
} from "./product-creation-route.js";
import { toProductSummary } from "./product-summary-wire.js";
import type { ProductsRouteOptions } from "./products-list-route.js";

const NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no product with that id",
} as const;

const STALE_VERSION_RESPONSE = {
  code: "stale_version",
  message: "this product was changed since it was loaded",
} as const;

const SALE_UNIT_HELD_BY_DISCOUNT_RESPONSE = {
  code: "sale_unit_held_by_discount",
  message: "a product cannot be sold by weight while a live buy-n-pay-m discount targets it",
} as const;

async function findProductById<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  id: string,
): Promise<{ id: string } | undefined> {
  if (!UUID_PATTERN.test(id)) {
    return undefined;
  }
  const [product] = await db.select({ id: products.id }).from(products).where(eq(products.id, id));
  return product;
}

export function registerProductEditRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: ProductsRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const catalogStore = new DrizzleCatalogStore(options.db);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.put<{ Params: { id: string } }>(
    "/products/:id",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: {
        access: permissionAccess("manage_products_and_categories"),
        sessionSource,
      },
    },
    async (request, reply) => {
      const target = await findProductById(options.db, request.params.id);
      if (!target) {
        await reply.code(404).send(NOT_FOUND_RESPONSE);
        return;
      }

      const parsedBody = await readValidatedBody(reply, productEditBodySchema, request.body);
      if (!parsedBody) {
        return;
      }

      const outcome = await editProduct(
        { store: catalogStore, clock: { now } },
        { id: target.id, ...parsedBody },
      );

      if (outcome.kind === "stale_version") {
        await reply.code(409).send(STALE_VERSION_RESPONSE);
        return;
      }
      if (outcome.kind === "category_not_found") {
        await reply.code(400).send({
          code: "validation_failed",
          message: CATEGORY_NOT_FOUND_FAILURE.message,
          details: [{ field: CATEGORY_NOT_FOUND_FAILURE.field }],
        });
        return;
      }
      if (outcome.kind === "category_not_leaf") {
        await reply.code(409).send(CATEGORY_NOT_LEAF_RESPONSE);
        return;
      }
      if (outcome.kind === "brand_not_found") {
        await reply.code(400).send({
          code: "validation_failed",
          message: BRAND_NOT_FOUND_FAILURE.message,
          details: [{ field: BRAND_NOT_FOUND_FAILURE.field }],
        });
        return;
      }
      if (outcome.kind === "brand_inactive") {
        await reply.code(409).send(BRAND_INACTIVE_RESPONSE);
        return;
      }
      if (outcome.kind === "tag_not_found") {
        await reply.code(400).send({
          code: "validation_failed",
          message: TAG_NOT_FOUND_FAILURE.message,
          details: [{ field: TAG_NOT_FOUND_FAILURE.field }],
        });
        return;
      }
      if (outcome.kind === "tag_inactive") {
        await reply.code(409).send({ ...TAG_INACTIVE_RESPONSE, tagId: outcome.tagId });
        return;
      }
      if (outcome.kind === "sale_unit_held_by_discount") {
        await reply
          .code(409)
          .send({ ...SALE_UNIT_HELD_BY_DISCOUNT_RESPONSE, discountName: outcome.discountName });
        return;
      }
      if (outcome.kind === "barcode_taken") {
        await reply.code(409).send({ code: "barcode_taken", codes: outcome.codes });
        return;
      }

      await reply.code(200).send(productSummarySchema.parse(toProductSummary(outcome.product)));
    },
  );
}
