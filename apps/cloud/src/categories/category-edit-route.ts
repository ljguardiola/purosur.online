import { eq, sql } from "drizzle-orm";
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
  CATEGORY_NAME_TAKEN_RESPONSE,
  CategoryNameTaken,
  isCategoryNameUniqueViolation,
} from "./category-creation-route.js";
import {
  type CategoryFieldValidationFailure,
  categoryNameValidationFailure,
  readCategoryName,
} from "./category-validation.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A malformed id and one that simply doesn't exist answer alike, the same "none of the two ever
// leaks which one it was" reasoning `role-read-route.ts` applies to a role id.
const NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no category with that id",
} as const;

const STALE_VERSION_RESPONSE = {
  code: "stale_version",
  message: "this category was changed since it was loaded",
} as const;

interface EditRequestBody {
  name: string;
  version: number;
}

function readVersion(body: unknown): number | undefined {
  const raw = (body as { version?: unknown } | undefined)?.version;
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 1 ? raw : undefined;
}

function readEditBody(body: unknown): EditRequestBody | CategoryFieldValidationFailure {
  const name = readCategoryName(body);
  const nameFailure = categoryNameValidationFailure(name);
  if (nameFailure) {
    return nameFailure;
  }
  if (!name) {
    // Unreachable: `categoryNameValidationFailure` above already rejects an empty or missing name.
    return { field: "name", message: "name must not be empty" };
  }
  const version = readVersion(body);
  if (version === undefined) {
    return { field: "version", message: "version must be the positive integer it was loaded with" };
  }
  return { name, version };
}

function isValidationFailure(
  value: EditRequestBody | CategoryFieldValidationFailure,
): value is CategoryFieldValidationFailure {
  return "field" in value;
}

/** Looks up one category by id, answering `undefined` for a malformed or missing one alike. */
export async function findCategoryById<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  id: string,
): Promise<CategoryRow | undefined> {
  if (!UUID_PATTERN.test(id)) {
    return undefined;
  }
  const [category] = await db
    .select({ id: categories.id, name: categories.name, version: categories.version })
    .from(categories)
    .where(eq(categories.id, id));
  return category;
}

export interface EditCategoryInput {
  id: string;
  name: string;
  version: number;
}

export type EditCategoryOutcome =
  | { kind: "stale_version" }
  | { kind: "name_taken" }
  | { kind: "applied"; category: CategoryRow };

/**
 * Renames one category in one transaction, rejecting a save made over a version someone else
 * already changed the same way `editRole` (`role-edit-route.ts`) rejects one. A name that already
 * belongs to another category is rejected the same way `createCategory` rejects one, including its
 * own database backstop for a name that lands concurrently. Leaving the name exactly as it was is a
 * no-op: the version does not bump.
 */
export async function editCategory<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: EditCategoryInput,
): Promise<EditCategoryOutcome> {
  return db
    .transaction<EditCategoryOutcome>(async (tx) => {
      // Locks this one row so a concurrent edit against the same category waits instead of racing.
      const [current] = await tx
        .select({ name: categories.name, version: categories.version })
        .from(categories)
        .where(eq(categories.id, input.id))
        .for("update");
      if (!current || current.version !== input.version) {
        return { kind: "stale_version" };
      }

      if (current.name === input.name) {
        return {
          kind: "applied",
          category: { id: input.id, name: input.name, version: current.version },
        };
      }

      const [nameTaken] = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(
          sql`lower(${categories.name}) = lower(${input.name}) and ${categories.id} != ${input.id}`,
        )
        .limit(1);
      if (nameTaken) {
        throw new CategoryNameTaken();
      }

      const nextVersion = current.version + 1;
      await tx
        .update(categories)
        .set({ name: input.name, version: nextVersion })
        .where(eq(categories.id, input.id));

      return {
        kind: "applied",
        category: { id: input.id, name: input.name, version: nextVersion },
      };
    })
    .catch((error: unknown): EditCategoryOutcome => {
      if (error instanceof CategoryNameTaken || isCategoryNameUniqueViolation(error)) {
        return { kind: "name_taken" };
      }
      throw error;
    });
}

/**
 * Registers `POST /categories/:id/edit`, gated by the `manage_products_and_categories` permission
 * (an Administrator always holds it too). Unlike `POST /roles/:id/edit`, this needs no passkey
 * step-up: roles require it because they're Administrator-only; categories don't.
 */
export function registerCategoryEditRoute<TQueryResult extends PgQueryResultHKT>(
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

  app.post<{ Params: { id: string } }>(
    "/categories/:id/edit",
    {
      preHandler: originGuard(checkOrigin),
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

      const parsedBody = readEditBody(request.body);
      if (isValidationFailure(parsedBody)) {
        await reply.code(400).send({
          code: "validation_failed",
          message: parsedBody.message,
          details: [{ field: parsedBody.field }],
        });
        return;
      }

      const outcome = await editCategory(options.db, {
        id: target.id,
        name: parsedBody.name,
        version: parsedBody.version,
      });

      if (outcome.kind === "stale_version") {
        await reply.code(409).send(STALE_VERSION_RESPONSE);
        return;
      }
      if (outcome.kind === "name_taken") {
        await reply.code(409).send(CATEGORY_NAME_TAKEN_RESPONSE);
        return;
      }

      await reply.code(200).send(outcome.category);
    },
  );
}
