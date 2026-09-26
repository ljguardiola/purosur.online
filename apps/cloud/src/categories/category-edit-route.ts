import { and, eq, isNull, ne, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { categories, products } from "../db/schema.js";
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
} from "./category-creation-route.js";
import {
  type CategoryFieldValidationFailure,
  categoryNameValidationFailure,
  hasParentId,
  readCategoryName,
  readParentId,
  UUID_PATTERN,
} from "./category-validation.js";

// Every move (an edit that names a specific, non-null parent) acquires this fixed-key transaction
// lock before it locks any row, the same `pg_advisory_xact_lock(hashtextextended(key, 0))` shape
// `recovery-rejected-attempt-flush.ts`'s `FLUSH_LOCK_KEY` uses. This must run before this
// transaction's own row lock below: if it ran after, two concurrent moves could each hold their
// own category's row lock while waiting for this lock, and then each try to lock the other's row
// as the new parent, deadlocking instead of serializing. With this ordering, only one move-capable
// edit is ever locking rows at a time, so the descendant check below always sees the other move's
// already-committed result rather than racing it into a cycle.
const CATEGORY_MOVE_LOCK_KEY = "category-move";

export const CATEGORY_MOVE_NOT_ALLOWED_RESPONSE = {
  code: "category_move_not_allowed",
  message: "a category can't be moved under itself or one of its own descendants",
} as const;

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
  // Unlike creation, an edit must name the parent explicitly (`null` for top level): a client
  // loaded before nesting existed sends only a name and version, and reading that as "top level"
  // would silently un-nest the category it renames.
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

/** Whether any product is currently assigned to this category. */
async function categoryHasProducts<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  categoryId: string,
): Promise<boolean> {
  const [product] = await tx
    .select({ id: products.id })
    .from(products)
    .where(eq(products.categoryId, categoryId))
    .limit(1);
  return product !== undefined;
}

/**
 * Whether moving `movingCategoryId` to become a child of `newParentId` would create a cycle:
 * `newParentId` itself, or one of its own ancestors, is `movingCategoryId`. Walks `parent_id`
 * links up from `newParentId` inside the same locked transaction, rather than a recursive SQL
 * query, so it reads the same way every other lookup in this file does and needs no
 * driver-specific row-shape handling. Moves never create a cycle by construction, so this loop is
 * bounded by the tree's own depth.
 */
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

/**
 * Renames and/or moves one category in one transaction, rejecting a save made over a version
 * someone else already changed the same way `editRole` (`role-edit-route.ts`) rejects one. Moving
 * to a specific parent first takes the fixed-key lock documented on `CATEGORY_MOVE_LOCK_KEY`
 * above, then locks that parent row `FOR UPDATE` (the same lock `createCategory`,
 * `category-creation-route.ts`, and `createProduct`/`editProduct`, `product-*-route.ts`, take on a
 * category), so "does the new parent have products" can't slip past a concurrent write on the
 * other side. A name that already belongs to a sibling under the (possibly new) parent is
 * rejected the same way `createCategory` rejects one, including its own database backstop for a
 * name that lands concurrently. Leaving both the name and the parent exactly as they were is a
 * no-op: the version does not bump.
 */
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
        if (!UUID_PATTERN.test(input.parentId)) {
          return { kind: "parent_not_found" };
        }
        const [parent] = await tx
          .select({ id: categories.id })
          .from(categories)
          .where(eq(categories.id, input.parentId))
          .for("update");
        if (!parent) {
          return { kind: "parent_not_found" };
        }
        if (await wouldCreateCycle(tx, input.parentId, input.id)) {
          return { kind: "move_not_allowed" };
        }
        if (await categoryHasProducts(tx, input.parentId)) {
          return { kind: "parent_has_products" };
        }
      }

      const parentMatch =
        input.parentId === null
          ? isNull(categories.parentId)
          : eq(categories.parentId, input.parentId);
      const [nameTaken] = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(
          and(
            parentMatch,
            sql`lower(${categories.name}) = lower(${input.name})`,
            ne(categories.id, input.id),
          ),
        )
        .limit(1);
      if (nameTaken) {
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
