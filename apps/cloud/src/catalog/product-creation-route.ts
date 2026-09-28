import { createProduct } from "@purosur/domain/catalog/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  originGuard,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { DrizzleCatalogStore } from "./drizzle-catalog-store.js";
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

export const CATEGORY_NOT_FOUND_FAILURE: ProductFieldValidationFailure = {
  field: "categoryId",
  message: "categoryId must be an existing category's id",
};

// 409, not 400 like `CATEGORY_NOT_FOUND_FAILURE`: a well-formed, existing categoryId that isn't a
// leaf is a state conflict, not a malformed request.
export const CATEGORY_NOT_LEAF_RESPONSE = {
  code: "category_not_leaf",
  message: "categoryId must be a leaf category with no subcategories of its own",
} as const;

interface CreationRequestBody {
  name: string;
  categoryId: string;
  saleUnit: SaleUnit;
  barcodes: string[];
  netContent: NetContentInput | null;
}

function readCreationBody(body: unknown): CreationRequestBody | ProductFieldValidationFailure {
  const name = readProductName(body);
  const categoryId = readCategoryId(body);
  const saleUnit = readSaleUnit(body);
  const barcodes = readBarcodes(body);
  const netContent = readNetContent(body);
  const failure = validateProductFields({ name, categoryId, saleUnit, barcodes, netContent });
  if (failure) {
    return failure;
  }
  // `validateProductFields` above already guarantees every one of these is defined.
  return {
    name: name as string,
    categoryId: categoryId as string,
    saleUnit: saleUnit as SaleUnit,
    barcodes: barcodes as string[],
    netContent: netContent === undefined ? null : (netContent as NetContentInput),
  };
}

function isValidationFailure(
  value: CreationRequestBody | ProductFieldValidationFailure,
): value is ProductFieldValidationFailure {
  return "field" in value;
}

// No passkey step-up: creating a product is routine work, not a sensitive account or role change.
export function registerProductCreationRoute<TQueryResult extends PgQueryResultHKT>(
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

      const outcome = await createProduct(catalogStore, parsedBody);

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
