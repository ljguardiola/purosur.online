import { productEditBodySchema, productSummarySchema } from "@purosur/contracts";
import { editProduct } from "@purosur/domain/catalog/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { backofficeOriginGuard } from "../access/backoffice-origin.js";
import {
  capabilityAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { readRecordIds } from "../platform/record-id-params.js";
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

const INTERNAL_BARCODE_ON_PRODUCT_WITH_BARCODES_RESPONSE = {
  code: "internal_barcode_on_product_with_barcodes",
  message: "an internal barcode can only be added to a product that has no barcode",
} as const;

export function registerProductEditRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: ProductsRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const catalogStore = new DrizzleCatalogStore(options.db);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.put(
    "/products/:id",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: {
        access: capabilityAccess("products_and_categories"),
        sessionSource,
      },
    },
    async (request, reply) => {
      const ids = await readRecordIds(reply, request.params, ["id"]);
      if (!ids) {
        return;
      }
      const parsedBody = await readValidatedBody(reply, productEditBodySchema, request.body);
      if (!parsedBody) {
        return;
      }

      const outcome = await editProduct(
        { store: catalogStore, clock: { now } },
        { id: ids.id, ...parsedBody },
      );

      if (outcome.kind === "not_found") {
        await reply.code(404).send(NOT_FOUND_RESPONSE);
        return;
      }
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
      if (outcome.kind === "internal_barcode_on_product_with_barcodes") {
        await reply.code(409).send(INTERNAL_BARCODE_ON_PRODUCT_WITH_BARCODES_RESPONSE);
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
