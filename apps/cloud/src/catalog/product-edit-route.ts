import { editProduct } from "@purosur/domain";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  originGuard,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { products } from "../platform/db/schema.js";
import { UUID_PATTERN } from "../platform/db/uuid-pattern.js";
import { DrizzleCatalogStore } from "./drizzle-catalog-store.js";
import {
  CATEGORY_NOT_FOUND_FAILURE,
  CATEGORY_NOT_LEAF_RESPONSE,
} from "./product-creation-route.js";
import {
  type NetContentInput,
  type ProductFieldValidationFailure,
  readBarcodes,
  readCategoryId,
  readNetContent,
  readProductName,
  readSaleUnit,
  type SaleUnit,
  validateProductFields,
} from "./product-validation.js";
import type { ProductsRouteOptions } from "./products-list-route.js";

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

async function findProductById<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  id: string,
): Promise<{ id: string } | undefined> {
  if (!UUID_PATTERN.test(id)) {
    return undefined;
  }
  const [product] = await db.select({ id: products.id }).from(products).where(eq(products.id, id));
  return product;
}

// No passkey step-up: editing a product is routine work, not a sensitive account or role change.
export function registerProductEditRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: ProductsRouteOptions<TQueryResult>,
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

      const outcome = await editProduct(catalogStore, { id: target.id, ...parsedBody });

      if (outcome.kind === "not_found") {
        await reply.code(404).send(NOT_FOUND_RESPONSE);
        return;
      }
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
      if (outcome.kind === "category_not_leaf") {
        await reply.code(409).send(CATEGORY_NOT_LEAF_RESPONSE);
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
