import { and, eq, inArray, ne } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { categories, productBarcodes, products } from "../db/schema.js";
import {
  originGuard,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../session/route-access.js";
import { CATEGORY_NOT_FOUND_FAILURE, isBarcodeUniqueViolation } from "./product-creation-route.js";
import {
  type NetContentInput,
  type ProductFieldValidationFailure,
  readBarcodes,
  readCategoryId,
  readNetContent,
  readProductName,
  readSaleUnit,
  type SaleUnit,
  UUID_PATTERN,
  validateProductFields,
} from "./product-validation.js";
import {
  netContentRow,
  type ProductRow,
  type ProductsRouteOptions,
} from "./products-list-route.js";

const NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no product with that id",
} as const;

const STALE_VERSION_RESPONSE = {
  code: "stale_version",
  message: "this product was changed since it was loaded",
} as const;

interface EditRequestBody {
  name: string;
  categoryId: string;
  saleUnit: SaleUnit;
  barcodes: string[];
  netContent: NetContentInput | null;
  version: number;
}

function readVersion(body: unknown): number | undefined {
  const raw = (body as { version?: unknown } | undefined)?.version;
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 1 ? raw : undefined;
}

/**
 * `netContent` absent from the body clears it the same way an explicit `null` does: this route
 * already requires every other field to be resent on every edit, so there is no partial-patch
 * convention to distinguish "not sent" from "sent as empty" for this one field either.
 */
function readEditBody(body: unknown): EditRequestBody | ProductFieldValidationFailure {
  const name = readProductName(body);
  const categoryId = readCategoryId(body);
  const saleUnit = readSaleUnit(body);
  const barcodes = readBarcodes(body);
  const netContent = readNetContent(body);
  const failure = validateProductFields({ name, categoryId, saleUnit, barcodes, netContent });
  if (failure) {
    return failure;
  }
  const version = readVersion(body);
  if (version === undefined) {
    return { field: "version", message: "version must be the positive integer it was loaded with" };
  }
  // `validateProductFields` above already guarantees every one of these is defined.
  return {
    name: name as string,
    categoryId: categoryId as string,
    saleUnit: saleUnit as SaleUnit,
    barcodes: barcodes as string[],
    netContent: netContent === undefined ? null : (netContent as NetContentInput),
    version,
  };
}

function isValidationFailure(
  value: EditRequestBody | ProductFieldValidationFailure,
): value is ProductFieldValidationFailure {
  return "field" in value;
}

/** Looks up one product by id, answering `undefined` for a malformed or missing one alike. */
export async function findProductById<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  id: string,
): Promise<{ id: string } | undefined> {
  if (!UUID_PATTERN.test(id)) {
    return undefined;
  }
  const [product] = await db.select({ id: products.id }).from(products).where(eq(products.id, id));
  return product;
}

export interface EditProductInput {
  id: string;
  name: string;
  categoryId: string;
  saleUnit: SaleUnit;
  barcodes: string[];
  netContent: NetContentInput | null;
  version: number;
}

export type EditProductOutcome =
  | { kind: "stale_version" }
  | { kind: "category_not_found" }
  | { kind: "barcode_taken"; codes: string[] }
  | { kind: "applied"; product: ProductRow };

/**
 * A code held only by another product's inactive (deactivated) barcode is free to reuse (#309): a
 * barcode resolves to a single active product, so only an active barcode row counts as taken.
 */
async function barcodesTakenByAnotherProduct<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  codes: string[],
  excludingProductId: string,
): Promise<string[]> {
  const rows = await db
    .select({ code: productBarcodes.code })
    .from(productBarcodes)
    .where(
      and(
        inArray(productBarcodes.code, codes),
        ne(productBarcodes.productId, excludingProductId),
        eq(productBarcodes.active, true),
      ),
    );
  return rows.map((row) => row.code);
}

/**
 * Edits one product and replaces its barcode set in one transaction, rejecting a save made over a
 * version someone else already changed the same way `editCategory` (`category-edit-route.ts`)
 * rejects one. When the edited product is itself active, a code already held by another active
 * product is rejected the same way `createProduct` rejects one, including its own database
 * backstop for a code that lands concurrently; an inactive product's codes never collide, and a
 * code the product already holds is left alone. Unlike `editCategory`, this always bumps the
 * version: replacing the barcode set is a write on every call, so there is no meaningful no-op to
 * detect.
 */
export async function editProduct<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: EditProductInput,
): Promise<EditProductOutcome> {
  return db
    .transaction<EditProductOutcome>(async (tx) => {
      // Locks this one row so a concurrent edit against the same product waits instead of racing.
      const [current] = await tx
        .select({ version: products.version, active: products.active })
        .from(products)
        .where(eq(products.id, input.id))
        .for("update");
      if (!current || current.version !== input.version) {
        return { kind: "stale_version" };
      }

      if (!UUID_PATTERN.test(input.categoryId)) {
        return { kind: "category_not_found" };
      }
      const [category] = await tx
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .where(eq(categories.id, input.categoryId))
        .limit(1);
      if (!category) {
        return { kind: "category_not_found" };
      }

      // An inactive product's barcodes are written inactive below, and uniqueness only binds active
      // barcodes, so a code an active product holds does not conflict with them.
      if (current.active) {
        const taken = await barcodesTakenByAnotherProduct(tx, input.barcodes, input.id);
        if (taken.length > 0) {
          return { kind: "barcode_taken", codes: taken };
        }
      }

      const nextVersion = current.version + 1;
      await tx
        .update(products)
        .set({
          name: input.name,
          categoryId: input.categoryId,
          saleUnit: input.saleUnit,
          netContentQuantity: input.netContent?.quantity ?? null,
          netContentUnit: input.netContent?.unit ?? null,
          version: nextVersion,
        })
        .where(eq(products.id, input.id));
      await tx.delete(productBarcodes).where(eq(productBarcodes.productId, input.id));
      await tx.insert(productBarcodes).values(
        // Mirrors the product's own (unchanged) `active` flag onto every replaced barcode row
        // (schema.ts comment on `productBarcodes`): editing an inactive product stays allowed, and
        // its barcodes stay inactive, not silently reactivated by the default.
        input.barcodes.map((code, position) => ({
          productId: input.id,
          code,
          position,
          active: current.active,
        })),
      );

      return {
        kind: "applied",
        product: {
          id: input.id,
          name: input.name,
          categoryId: input.categoryId,
          categoryName: category.name,
          saleUnit: input.saleUnit,
          barcodes: input.barcodes,
          netContent: netContentRow({
            netContentQuantity: input.netContent?.quantity ?? null,
            netContentUnit: input.netContent?.unit ?? null,
          }),
          active: current.active,
          version: nextVersion,
        },
      };
    })
    .catch(async (error: unknown): Promise<EditProductOutcome> => {
      if (!isBarcodeUniqueViolation(error)) {
        throw error;
      }
      return {
        kind: "barcode_taken",
        codes: await barcodesTakenByAnotherProduct(db, input.barcodes, input.id),
      };
    });
}

/**
 * Registers `POST /products/:id/edit`, gated by the `manage_products_and_categories` permission
 * (an Administrator always holds it too). Like categories, this needs no passkey step-up.
 */
export function registerProductEditRoute<TQueryResult extends PgQueryResultHKT>(
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

  app.post<{ Params: { id: string } }>(
    "/products/:id/edit",
    {
      preHandler: originGuard(checkOrigin),
      config: {
        access: permissionAccess("manage_products_and_categories"),
        sessionSource,
      },
    },
    async (request, reply) => {
      const target = await findProductById(options.db, request.params.id);
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

      const outcome = await editProduct(options.db, { id: target.id, ...parsedBody });

      if (outcome.kind === "stale_version") {
        await reply.code(409).send(STALE_VERSION_RESPONSE);
        return;
      }
      if (outcome.kind === "category_not_found") {
        await reply.code(400).send({
          code: "validation_failed",
          message: CATEGORY_NOT_FOUND_FAILURE.message,
          details: [{ field: CATEGORY_NOT_FOUND_FAILURE.field }],
        });
        return;
      }
      if (outcome.kind === "barcode_taken") {
        await reply.code(409).send({ code: "barcode_taken", codes: outcome.codes });
        return;
      }

      await reply.code(200).send(outcome.product);
    },
  );
}
