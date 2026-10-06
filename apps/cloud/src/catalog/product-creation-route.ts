import { productCreationBodySchema, productSummarySchema } from "@purosur/contracts";
import { createProduct } from "@purosur/domain/catalog/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { backofficeOriginGuard } from "../access/backoffice-origin.js";
import {
  capabilityAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { DrizzleCatalogStore } from "./drizzle-catalog-store.js";
import { toProductSummary } from "./product-summary-wire.js";
import type { ProductsRouteOptions } from "./products-list-route.js";

export const CATEGORY_NOT_FOUND_FAILURE = {
  field: "categoryId",
  message: "categoryId must be an existing category's id",
} as const;

export const CATEGORY_NOT_LEAF_RESPONSE = {
  code: "category_not_leaf",
  message: "categoryId must be a leaf category with no subcategories of its own",
} as const;

export const BRAND_NOT_FOUND_FAILURE = {
  field: "brandId",
  message: "brandId must be an existing brand's id, or null for none",
} as const;

export const BRAND_INACTIVE_RESPONSE = {
  code: "brand_inactive",
  message: "a deactivated brand can only stay on a product that already carries it",
} as const;

export const TAG_NOT_FOUND_FAILURE = {
  field: "tagIds",
  message: "tagIds must be a list of existing tags' ids, [] for none",
} as const;

export const TAG_INACTIVE_RESPONSE = {
  code: "tag_inactive",
  message: "a deactivated tag can only stay on a product that already carries it",
} as const;

export function registerProductCreationRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: ProductsRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const catalogStore = new DrizzleCatalogStore(options.db);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.post(
    "/products",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: {
        access: capabilityAccess("products_and_categories"),
        sessionSource,
      },
    },
    async (request, reply) => {
      const parsedBody = await readValidatedBody(reply, productCreationBodySchema, request.body);
      if (!parsedBody) {
        return;
      }

      const outcome = await createProduct(catalogStore, parsedBody);

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
      if (outcome.kind === "barcode_taken") {
        await reply.code(409).send({ code: "barcode_taken", codes: outcome.codes });
        return;
      }

      await reply.code(201).send(productSummarySchema.parse(toProductSummary(outcome.product)));
    },
  );
}
