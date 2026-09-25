import { and, eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { categories, productBarcodes, products } from "../db/schema.js";
import {
  originGuard,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../session/route-access.js";
import {
  type ProductFieldValidationFailure,
  readBarcodes,
  readCategoryId,
  readProductName,
  readSaleUnit,
  type SaleUnit,
  UUID_PATTERN,
  validateProductFields,
} from "./product-validation.js";
import type { ProductRow, ProductsRouteOptions } from "./products-list-route.js";

const UNIQUE_VIOLATION = "23505";
const BARCODE_UNIQUE_INDEX = "product_barcodes_code_key";

export const CATEGORY_NOT_FOUND_FAILURE: ProductFieldValidationFailure = {
  field: "categoryId",
  message: "categoryId must be an existing category's id",
};

// A leaf-only violation is a 409, not a 400 like `CATEGORY_NOT_FOUND_FAILURE`: unlike a malformed
// or nonexistent id, `categoryId` here is well-formed and names a real category, so it is a
// conflict with the tree's current state, the same way `barcode_taken` (below) is, not a
// malformed request.
export const CATEGORY_NOT_LEAF_RESPONSE = {
  code: "category_not_leaf",
  message: "categoryId must be a leaf category with no subcategories of its own",
} as const;

/**
 * Walks the driver error (wrapped by Drizzle as its `cause`) for a unique violation on
 * `product_barcodes.code`, the same shape `isCategoryNameUniqueViolation`
 * (`category-creation-route.ts`) maps for `categories.name`; `product-edit-route.ts` reuses this
 * mapping for its own edit transaction.
 */
export function isBarcodeUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    const { code, constraint, constraint_name } = current as {
      code?: unknown;
      constraint?: unknown;
      constraint_name?: unknown;
    };
    const index = constraint_name ?? constraint;
    if (code === UNIQUE_VIOLATION && index === BARCODE_UNIQUE_INDEX) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

interface CreationRequestBody {
  name: string;
  categoryId: string;
  saleUnit: SaleUnit;
  barcodes: string[];
}

function readCreationBody(body: unknown): CreationRequestBody | ProductFieldValidationFailure {
  const name = readProductName(body);
  const categoryId = readCategoryId(body);
  const saleUnit = readSaleUnit(body);
  const barcodes = readBarcodes(body);
  const failure = validateProductFields({ name, categoryId, saleUnit, barcodes });
  if (failure) {
    return failure;
  }
  // `validateProductFields` above already guarantees every one of these is defined.
  return {
    name: name as string,
    categoryId: categoryId as string,
    saleUnit: saleUnit as SaleUnit,
    barcodes: barcodes as string[],
  };
}

function isValidationFailure(
  value: CreationRequestBody | ProductFieldValidationFailure,
): value is ProductFieldValidationFailure {
  return "field" in value;
}

export interface CreateProductInput {
  name: string;
  categoryId: string;
  saleUnit: SaleUnit;
  barcodes: string[];
}

export type CreateProductOutcome =
  | { kind: "category_not_found" }
  | { kind: "category_not_leaf" }
  | { kind: "barcode_taken"; codes: string[] }
  | { kind: "created"; product: ProductRow };

/**
 * A code held only by an inactive product's (deactivated) barcode is free to reuse (#309): a
 * barcode resolves to a single active product, so only an active barcode row counts as taken.
 */
async function takenBarcodes<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  codes: string[],
): Promise<string[]> {
  const rows = await db
    .select({ code: productBarcodes.code })
    .from(productBarcodes)
    .where(and(inArray(productBarcodes.code, codes), eq(productBarcodes.active, true)));
  return rows.map((row) => row.code);
}

/**
 * Creates a product and its barcodes in one transaction. The category is locked `FOR UPDATE`
 * first (the same lock `createCategory`/`editCategory`, `category-*-route.ts`, take on a category
 * they are about to give a child), so this and a concurrent `createCategory`/`editCategory`
 * targeting the same category can never both slip past the other's check: either this sees the
 * child that was just added and rejects as non-leaf, or the category create/move sees this
 * product and rejects as having products. The barcode-uniqueness check runs next, inside the same
 * transaction; the database's own unique index (`product_barcodes_code_key`) is the backstop for
 * a code that lands concurrently, mapped by `isBarcodeUniqueViolation`. On that race, which of
 * this request's codes is now taken isn't known from the violation itself, so it's re-read after
 * the transaction rolls back.
 */
export async function createProduct<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: CreateProductInput,
): Promise<CreateProductOutcome> {
  return db
    .transaction<CreateProductOutcome>(async (tx) => {
      if (!UUID_PATTERN.test(input.categoryId)) {
        return { kind: "category_not_found" };
      }
      const [category] = await tx
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .where(eq(categories.id, input.categoryId))
        .for("update");
      if (!category) {
        return { kind: "category_not_found" };
      }
      const [childCategory] = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.parentId, input.categoryId))
        .limit(1);
      if (childCategory) {
        return { kind: "category_not_leaf" };
      }

      const taken = await takenBarcodes(tx, input.barcodes);
      if (taken.length > 0) {
        return { kind: "barcode_taken", codes: taken };
      }

      const [newProduct] = await tx
        .insert(products)
        .values({ name: input.name, categoryId: input.categoryId, saleUnit: input.saleUnit })
        .returning({
          id: products.id,
          name: products.name,
          categoryId: products.categoryId,
          saleUnit: products.saleUnit,
          active: products.active,
          version: products.version,
        });
      if (!newProduct) {
        throw new Error("inserting the product returned no row");
      }
      await tx
        .insert(productBarcodes)
        .values(
          input.barcodes.map((code, position) => ({ productId: newProduct.id, code, position })),
        );

      return {
        kind: "created",
        product: {
          id: newProduct.id,
          name: newProduct.name,
          categoryId: newProduct.categoryId,
          categoryName: category.name,
          saleUnit: newProduct.saleUnit as SaleUnit,
          barcodes: input.barcodes,
          active: newProduct.active,
          version: newProduct.version,
        },
      };
    })
    .catch(async (error: unknown): Promise<CreateProductOutcome> => {
      if (!isBarcodeUniqueViolation(error)) {
        throw error;
      }
      return { kind: "barcode_taken", codes: await takenBarcodes(db, input.barcodes) };
    });
}

/**
 * Registers `POST /products`, gated by the `manage_products_and_categories` permission (an
 * Administrator always holds it too). Like categories, this needs no passkey step-up.
 */
export function registerProductCreationRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: ProductsRouteOptions<TQueryResult>,
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
    "/products",
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

      const outcome = await createProduct(options.db, parsedBody);

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
