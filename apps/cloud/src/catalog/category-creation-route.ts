import { categoryCreationBodySchema, categorySummarySchema } from "@purosur/contracts";
import { createCategory } from "@purosur/domain/catalog/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { backofficeOriginGuard } from "../access/backoffice-origin.js";
import {
  capabilityAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import type { CategoriesRouteOptions } from "./categories-list-route.js";
import { DrizzleCatalogStore } from "./drizzle-catalog-store.js";

export const CATEGORY_NAME_TAKEN_RESPONSE = {
  code: "category_name_taken",
  message: "a category with that name already exists under that parent",
} as const;

export const CATEGORY_PARENT_NOT_FOUND_FAILURE = {
  field: "parentId",
  message: "parentId must be an existing category's id, or null for top level",
} as const;

export const CATEGORY_PARENT_HAS_PRODUCTS_RESPONSE = {
  code: "category_parent_has_products",
  message: "the parent category has products assigned; move them before adding a subcategory",
} as const;

export function registerCategoryCreationRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: CategoriesRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const catalogStore = new DrizzleCatalogStore(options.db);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.post(
    "/categories",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: {
        access: capabilityAccess("products_and_categories"),
        sessionSource,
      },
    },
    async (request, reply) => {
      const parsedBody = await readValidatedBody(reply, categoryCreationBodySchema, request.body);
      if (!parsedBody) {
        return;
      }

      const outcome = await createCategory(catalogStore, parsedBody);

      if (outcome.kind === "parent_not_found") {
        await reply.code(400).send({
          code: "validation_failed",
          message: CATEGORY_PARENT_NOT_FOUND_FAILURE.message,
          details: [{ field: CATEGORY_PARENT_NOT_FOUND_FAILURE.field }],
        });
        return;
      }
      if (outcome.kind === "parent_has_products") {
        await reply.code(409).send(CATEGORY_PARENT_HAS_PRODUCTS_RESPONSE);
        return;
      }
      if (outcome.kind === "name_taken") {
        await reply.code(409).send(CATEGORY_NAME_TAKEN_RESPONSE);
        return;
      }

      await reply.code(201).send(categorySummarySchema.parse(outcome.category));
    },
  );
}
