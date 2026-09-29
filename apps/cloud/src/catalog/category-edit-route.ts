import {
  type CategorySummary,
  categoryEditBodySchema,
  categorySummarySchema,
} from "@purosur/contracts";
import { editCategory } from "@purosur/domain/catalog/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { backofficeOriginGuard } from "../access/backoffice-origin.js";
import {
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { categories } from "../platform/db/schema.js";
import { UUID_PATTERN } from "../platform/db/uuid-pattern.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import type { CategoriesRouteOptions } from "./categories-list-route.js";
import {
  CATEGORY_NAME_TAKEN_RESPONSE,
  CATEGORY_PARENT_HAS_PRODUCTS_RESPONSE,
  CATEGORY_PARENT_NOT_FOUND_FAILURE,
} from "./category-creation-route.js";
import { DrizzleCatalogStore } from "./drizzle-catalog-store.js";

const CATEGORY_MOVE_NOT_ALLOWED_RESPONSE = {
  code: "category_move_not_allowed",
  message: "a category can't be moved under itself or one of its own descendants",
} as const;

const NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no category with that id",
} as const;

const STALE_VERSION_RESPONSE = {
  code: "stale_version",
  message: "this category was changed since it was loaded",
} as const;

async function findCategoryById<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  id: string,
): Promise<CategorySummary | undefined> {
  if (!UUID_PATTERN.test(id)) {
    return undefined;
  }
  const [category] = await db
    .select({
      id: categories.id,
      name: categories.name,
      version: categories.version,
      parentId: categories.parentId,
    })
    .from(categories)
    .where(eq(categories.id, id));
  return category;
}

export function registerCategoryEditRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: CategoriesRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const catalogStore = new DrizzleCatalogStore(options.db);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.post<{ Params: { id: string } }>(
    "/categories/:id/edit",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: {
        access: permissionAccess("manage_products_and_categories"),
        sessionSource,
      },
    },
    async (request, reply) => {
      const target = await findCategoryById(options.db, request.params.id);
      if (!target) {
        await reply.code(404).send(NOT_FOUND_RESPONSE);
        return;
      }

      const parsedBody = await readValidatedBody(reply, categoryEditBodySchema, request.body);
      if (!parsedBody) {
        return;
      }

      const outcome = await editCategory(catalogStore, { id: target.id, ...parsedBody });

      if (outcome.kind === "stale_version") {
        await reply.code(409).send(STALE_VERSION_RESPONSE);
        return;
      }
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
      if (outcome.kind === "move_not_allowed") {
        await reply.code(409).send(CATEGORY_MOVE_NOT_ALLOWED_RESPONSE);
        return;
      }
      if (outcome.kind === "name_taken") {
        await reply.code(409).send(CATEGORY_NAME_TAKEN_RESPONSE);
        return;
      }

      await reply.code(200).send(categorySummarySchema.parse(outcome.category));
    },
  );
}
