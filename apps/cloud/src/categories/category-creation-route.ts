import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { categories } from "../db/schema.js";
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
} from "./category-validation.js";

export const CATEGORY_NAME_TAKEN_RESPONSE = {
  code: "category_name_taken",
  message: "a category with that name already exists",
} as const;

const UNIQUE_VIOLATION = "23505";
const CATEGORY_NAME_UNIQUE_INDEX = "categories_name_lower_key";

export class CategoryNameTaken extends Error {}

/**
 * Walks the driver error (wrapped by Drizzle as its `cause`) for a unique violation on the
 * case-insensitive `categories.name` index, the same shape `isRoleNameUniqueViolation`
 * (`role-creation-route.ts`) maps for `roles.name`; `category-edit-route.ts` reuses this mapping
 * for its own edit transaction.
 */
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
  return { name };
}

function isValidationFailure(
  value: CreationRequestBody | CategoryFieldValidationFailure,
): value is CategoryFieldValidationFailure {
  return "field" in value;
}

export interface CreateCategoryInput {
  name: string;
}

export type CreateCategoryOutcome =
  | { kind: "name_taken" }
  | { kind: "created"; category: CategoryRow };

/**
 * Creates a category in one transaction. The name uniqueness check runs first, inside the
 * transaction; the database's own case-insensitive unique index (`categories_name_lower_key`) is
 * the backstop for a name that lands concurrently, mapped by `isCategoryNameUniqueViolation` the
 * same way `createRole` (`role-creation-route.ts`) maps its own.
 */
export async function createCategory<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: CreateCategoryInput,
): Promise<CreateCategoryOutcome> {
  const created = await db
    .transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(sql`lower(${categories.name}) = lower(${input.name})`)
        .limit(1);
      if (existing) {
        throw new CategoryNameTaken();
      }

      const [newCategory] = await tx
        .insert(categories)
        .values({ name: input.name })
        .returning({ id: categories.id, name: categories.name, version: categories.version });
      if (!newCategory) {
        throw new Error("inserting the category returned no row");
      }

      return newCategory;
    })
    .catch((error: unknown) => {
      if (error instanceof CategoryNameTaken || isCategoryNameUniqueViolation(error)) {
        return undefined;
      }
      throw error;
    });

  if (!created) {
    return { kind: "name_taken" };
  }
  return { kind: "created", category: created };
}

/**
 * Registers `POST /categories`, gated by the `manage_products_and_categories` permission (an
 * Administrator always holds it too). Unlike `POST /roles`, this needs no passkey step-up: roles
 * require it because they're Administrator-only; categories don't.
 */
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

      const outcome = await createCategory(options.db, { name: parsedBody.name });

      if (outcome.kind === "name_taken") {
        await reply.code(409).send(CATEGORY_NAME_TAKEN_RESPONSE);
        return;
      }

      await reply.code(201).send(outcome.category);
    },
  );
}
