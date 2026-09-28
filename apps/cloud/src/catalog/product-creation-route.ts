import { productCreationBodySchema } from "@purosur/contracts";
import { createProduct } from "@purosur/domain/catalog/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  originGuard,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { DrizzleCatalogStore } from "./drizzle-catalog-store.js";
import type { ProductsRouteOptions } from "./products-list-route.js";

export const CATEGORY_NOT_FOUND_FAILURE = {
  field: "categoryId",
  message: "categoryId must be an existing category's id",
} as const;

export const CATEGORY_NOT_LEAF_RESPONSE = {
  code: "category_not_leaf",
  message: "categoryId must be a leaf category with no subcategories of its own",
} as const;

export function registerProductCreationRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: ProductsRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const catalogStore = new DrizzleCatalogStore(options.db);
  const sessionSource = routeSessionSource({ db: options.db, now });

  function checkOrigin(request: FastifyRequest, reply: FastifyReply): boolean {
    if (request.headers.origin !== options.backofficeOrigin) {
      void reply.code(403).send({
        code: "origin_rejected",
        message: "the request's Origin does not match the backoffice's own origin",
      });
      return false;
    }
    return true;
  }

  app.post(
    "/products",
    {
      preHandler: originGuard(checkOrigin),
      config: {
        access: permissionAccess("manage_products_and_categories"),
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
      if (outcome.kind === "barcode_taken") {
        await reply.code(409).send({ code: "barcode_taken", codes: outcome.codes });
        return;
      }

      await reply.code(201).send(outcome.product);
    },
  );
}
