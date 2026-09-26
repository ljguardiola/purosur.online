import { eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { categories } from "../db/schema.js";
import { UUID_PATTERN } from "../db/uuid-pattern.js";
import {
  originGuard,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../session/route-access.js";
import type { CategoriesRouteOptions, CategoryRow } from "./categories-list-route.js";
import {
  CATEGORY_NAME_TAKEN_RESPONSE,
  CATEGORY_PARENT_HAS_PRODUCTS_RESPONSE,
  CATEGORY_PARENT_NOT_FOUND_FAILURE,
  CategoryNameTaken,
  isCategoryNameUniqueViolation,
  lockParentForNewChild,
  siblingNameTaken,
} from "./category-creation-route.js";
import {
  type CategoryFieldValidationFailure,
  categoryNameValidationFailure,
  hasParentId,
  readCategoryName,
  readParentId,
} from "./category-validation.js";

// Acquired before any row lock: taken after, two concurrent moves could each hold their own row
// lock while waiting here, then deadlock trying to lock each other's row as the new parent. This
// ordering serializes moves, so the descendant check below never races another move into a cycle.
export const CATEGORY_MOVE_LOCK_KEY = "category-move";

export const CATEGORY_MOVE_NOT_ALLOWED_RESPONSE = {
  code: "category_move_not_allowed",
  message: "a category can't be moved under itself or one of its own descendants",
} as const;

// A malformed id and a missing one answer alike, so the response never leaks which case it was.
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
  parentId: string | null;
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
  // A client loaded before nesting existed sends only a name and version; treating a missing
  // parentId as "top level" would silently un-nest the category it renames.
  if (!hasParentId(body)) {
    return { field: "parentId", message: "parentId must be sent, null for top level" };
  }
  const parentId = readParentId(body);
  if (parentId === undefined) {
    return CATEGORY_PARENT_NOT_FOUND_FAILURE;
  }
  const version = readVersion(body);
  if (version === undefined) {
    return { field: "version", message: "version must be the positive integer it was loaded with" };
  }
  return { name, parentId, version };
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

export interface EditCategoryInput {
  id: string;
  name: string;
  parentId: string | null;
  version: number;
}

export type EditCategoryOutcome =
  | { kind: "stale_version" }
  | { kind: "name_taken" }
  | { kind: "parent_not_found" }
  | { kind: "parent_has_products" }
  | { kind: "move_not_allowed" }
  | { kind: "applied"; category: CategoryRow };

// A category tree has no cycles, so walking parent_id up from newParentId always terminates.
async function wouldCreateCycle<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  newParentId: string,
  movingCategoryId: string,
): Promise<boolean> {
  let currentId: string | null = newParentId;
  while (currentId !== null) {
    if (currentId === movingCategoryId) {
      return true;
    }
    const [row] = await tx
      .select({ parentId: categories.parentId })
      .from(categories)
      .where(eq(categories.id, currentId));
    currentId = row?.parentId ?? null;
  }
  return false;
}

export async function editCategory<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: EditCategoryInput,
): Promise<EditCategoryOutcome> {
  return db
    .transaction<EditCategoryOutcome>(async (tx) => {
      if (input.parentId !== null) {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${CATEGORY_MOVE_LOCK_KEY}, 0))`,
        );
      }

      // Locks this one row so a concurrent edit against the same category waits instead of racing.
      const [current] = await tx
        .select({
          name: categories.name,
          version: categories.version,
          parentId: categories.parentId,
        })
        .from(categories)
        .where(eq(categories.id, input.id))
        .for("update");
      if (!current || current.version !== input.version) {
        return { kind: "stale_version" };
      }

      const parentChanged = current.parentId !== input.parentId;
      if (!parentChanged && current.name === input.name) {
        return {
          kind: "applied",
          category: {
            id: input.id,
            name: input.name,
            parentId: input.parentId,
            version: current.version,
          },
        };
      }

      if (parentChanged && input.parentId !== null) {
        const parent = await lockParentForNewChild(tx, input.parentId);
        if (parent !== "locked") {
          return { kind: parent };
        }
        if (await wouldCreateCycle(tx, input.parentId, input.id)) {
          return { kind: "move_not_allowed" };
        }
      }

      if (await siblingNameTaken(tx, input.parentId, input.name, input.id)) {
        throw new CategoryNameTaken();
      }

      const nextVersion = current.version + 1;
      await tx
        .update(categories)
        .set({ name: input.name, parentId: input.parentId, version: nextVersion })
        .where(eq(categories.id, input.id));

      return {
        kind: "applied",
        category: {
          id: input.id,
          name: input.name,
          parentId: input.parentId,
          version: nextVersion,
        },
      };
    })
    .catch((error: unknown): EditCategoryOutcome => {
      if (error instanceof CategoryNameTaken || isCategoryNameUniqueViolation(error)) {
        return { kind: "name_taken" };
      }
      throw error;
    });
}

// No passkey step-up here: this permission isn't Administrator-only, unlike role management.
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
        parentId: parsedBody.parentId,
        version: parsedBody.version,
      });

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

      await reply.code(200).send(outcome.category);
    },
  );
}
