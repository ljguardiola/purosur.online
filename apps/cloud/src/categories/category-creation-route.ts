import { and, eq, isNull, ne, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { categories, products } from "../db/schema.js";
import { UUID_PATTERN } from "../db/uuid-pattern.js";
import {
  originGuard,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../session/route-access.js";
import type { CategoriesRouteOptions, CategoryRow } from "./categories-list-route.js";
import {
  type CategoryFieldValidationFailure,
  categoryNameValidationFailure,
  readCategoryName,
  readParentId,
} from "./category-validation.js";

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

const UNIQUE_VIOLATION = "23505";
const CATEGORY_NAME_UNIQUE_INDEX = "categories_name_lower_key";

export class CategoryNameTaken extends Error {}

// Walks the driver error Drizzle wraps as `cause`, looking for a Postgres unique violation on
// the case-insensitive `categories.name` index.
export function isCategoryNameUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    const { code, constraint, constraint_name } = current as {
      code?: unknown;
      constraint?: unknown;
      constraint_name?: unknown;
    };
    const index = constraint_name ?? constraint;
    if (code === UNIQUE_VIOLATION && index === CATEGORY_NAME_UNIQUE_INDEX) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

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

export interface CreateCategoryInput {
  name: string;
  parentId: string | null;
}

export type CreateCategoryOutcome =
  | { kind: "name_taken" }
  | { kind: "parent_not_found" }
  | { kind: "parent_has_products" }
  | { kind: "created"; category: CategoryRow };

// `FOR UPDATE` row lock, so the "has children"/"has products" checks below can't race a
// concurrent write on the same category; any assigned product blocks, inactive ones included.
export async function lockParentForNewChild<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  parentId: string,
): Promise<"parent_not_found" | "parent_has_products" | "locked"> {
  if (!UUID_PATTERN.test(parentId)) {
    return "parent_not_found";
  }
  const [parent] = await tx
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.id, parentId))
    .for("update");
  if (!parent) {
    return "parent_not_found";
  }
  const [product] = await tx
    .select({ id: products.id })
    .from(products)
    .where(eq(products.categoryId, parentId))
    .limit(1);
  return product ? "parent_has_products" : "locked";
}

export async function siblingNameTaken<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  parentId: string | null,
  name: string,
  excludingId?: string,
): Promise<boolean> {
  const [sibling] = await tx
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        parentId === null ? isNull(categories.parentId) : eq(categories.parentId, parentId),
        sql`lower(${categories.name}) = lower(${name})`,
        excludingId === undefined ? undefined : ne(categories.id, excludingId),
      ),
    )
    .limit(1);
  return sibling !== undefined;
}

// The database's own `categories_name_lower_key` unique index (NULLS NOT DISTINCT per parent)
// backstops a name that lands concurrently; the catch below maps that failure.
export async function createCategory<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: CreateCategoryInput,
): Promise<CreateCategoryOutcome> {
  return db
    .transaction<CreateCategoryOutcome>(async (tx) => {
      if (input.parentId !== null) {
        const parent = await lockParentForNewChild(tx, input.parentId);
        if (parent !== "locked") {
          return { kind: parent };
        }
      }

      if (await siblingNameTaken(tx, input.parentId, input.name)) {
        throw new CategoryNameTaken();
      }

      const [newCategory] = await tx
        .insert(categories)
        .values({ name: input.name, parentId: input.parentId })
        .returning({
          id: categories.id,
          name: categories.name,
          version: categories.version,
          parentId: categories.parentId,
        });
      if (!newCategory) {
        throw new Error("inserting the category returned no row");
      }

      return { kind: "created", category: newCategory };
    })
    .catch((error: unknown): CreateCategoryOutcome => {
      if (error instanceof CategoryNameTaken || isCategoryNameUniqueViolation(error)) {
        return { kind: "name_taken" };
      }
      throw error;
    });
}

// No passkey step-up here: this permission isn't Administrator-only, unlike role management.
export function registerCategoryCreationRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: CategoriesRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
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

      const outcome = await createCategory(options.db, {
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
