import { createCategory } from "@purosur/domain";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  originGuard,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import type { CategoriesRouteOptions } from "./categories-list-route.js";
import {
  type CategoryFieldValidationFailure,
  categoryNameValidationFailure,
  readCategoryName,
  readParentId,
} from "./category-validation.js";
import { DrizzleCatalogStore } from "./drizzle-catalog-store.js";

export const CATEGORY_NAME_TAKEN_RESPONSE = {
  code: "category_name_taken",
  message: "a category with that name already exists under that parent",
} as const;

export const CATEGORY_PARENT_NOT_FOUND_FAILURE: CategoryFieldValidationFailure = {
  field: "parentId",
  message: "parentId must be an existing category's id, or null for top level",
};

export const CATEGORY_PARENT_HAS_PRODUCTS_RESPONSE = {
  code: "category_parent_has_products",
  message: "the parent category has products assigned; move them before adding a subcategory",
} as const;

interface CreationRequestBody {
  name: string;
  parentId: string | null;
}

function readCreationBody(body: unknown): CreationRequestBody | CategoryFieldValidationFailure {
  const name = readCategoryName(body);
  const nameFailure = categoryNameValidationFailure(name);
  if (nameFailure) {
    return nameFailure;
  }
  if (!name) {
    // Unreachable: `categoryNameValidationFailure` above already rejects an empty or missing name.
    return { field: "name", message: "name must not be empty" };
  }
  const parentId = readParentId(body);
  if (parentId === undefined) {
    return CATEGORY_PARENT_NOT_FOUND_FAILURE;
  }
  return { name, parentId };
}

function isValidationFailure(
  value: CreationRequestBody | CategoryFieldValidationFailure,
): value is CategoryFieldValidationFailure {
  return "field" in value;
}

export function registerCategoryCreationRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: CategoriesRouteOptions<TQueryResult>,
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
    "/categories",
    {
      preHandler: originGuard(checkOrigin),
      config: {
        access: permissionAccess("manage_products_and_categories"),
        sessionSource,
      },
    },
    async (request, reply) => {
      const parsedBody = readCreationBody(request.body);
      if (isValidationFailure(parsedBody)) {
        await reply.code(400).send({
          code: "validation_failed",
          message: parsedBody.message,
          details: [{ field: parsedBody.field }],
        });
        return;
      }

      const outcome = await createCategory(catalogStore, {
        name: parsedBody.name,
        parentId: parsedBody.parentId,
      });

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

      await reply.code(201).send(outcome.category);
    },
  );
}
