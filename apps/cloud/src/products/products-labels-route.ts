import { asc, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { productBarcodes, products } from "../db/schema.js";
import {
  originGuard,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../session/route-access.js";
import { isInternalBarcode } from "./ean13-check-digit.js";
import { renderLabelSheetPdf } from "./label-sheet-pdf.js";
import { UUID_PATTERN } from "./product-validation.js";
import type { ProductsRouteOptions } from "./products-list-route.js";

// Mirrors `@purosur/contracts`'s label limits because this app's `tsc` build (explicit `rootDir`)
// cannot import that package's untranspiled source; the drift test guards against it.
export const MAX_LABEL_COUNT_PER_PRODUCT = 999;
export const MAX_TOTAL_LABEL_COUNT = 2400;

export interface LabelRequestEntry {
  productId: string;
  count: number;
}

interface LabelsValidationFailure {
  field: "labels";
  message: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readEntry(raw: unknown): LabelRequestEntry | undefined {
  if (!isPlainObject(raw)) {
    return undefined;
  }
  const { productId, count } = raw as { productId?: unknown; count?: unknown };
  if (typeof productId !== "string" || !UUID_PATTERN.test(productId)) {
    return undefined;
  }
  if (
    typeof count !== "number" ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > MAX_LABEL_COUNT_PER_PRODUCT
  ) {
    return undefined;
  }
  // Postgres stores and compares uuids in lowercase; the pattern above accepts either case.
  return { productId: productId.toLowerCase(), count };
}

/**
 * Reads and validates `{ labels: [{ productId, count }] }`: a non-empty list, no repeated
 * `productId`, each count a whole number 1..999, and a bounded total (2400 labels, 100 sheets).
 * Whether each `productId` names an existing product with an internal barcode is checked
 * separately against the database, not here.
 */
function readLabelsBody(body: unknown): LabelRequestEntry[] | LabelsValidationFailure {
  const raw = (body as { labels?: unknown } | undefined)?.labels;
  if (!Array.isArray(raw) || raw.length === 0) {
    return { field: "labels", message: "labels must be a non-empty list of { productId, count }" };
  }

  const entries: LabelRequestEntry[] = [];
  const seenProductIds = new Set<string>();
  let total = 0;
  for (const rawEntry of raw) {
    const entry = readEntry(rawEntry);
    if (!entry) {
      return {
        field: "labels",
        message: "each label must have an existing product's id and a count between 1 and 999",
      };
    }
    if (seenProductIds.has(entry.productId)) {
      return { field: "labels", message: "the same productId was sent more than once" };
    }
    seenProductIds.add(entry.productId);
    entries.push(entry);
    total += entry.count;
  }
  if (total > MAX_TOTAL_LABEL_COUNT) {
    return {
      field: "labels",
      message: `the total label count must be at most ${MAX_TOTAL_LABEL_COUNT}`,
    };
  }
  return entries;
}

function isValidationFailure(
  value: LabelRequestEntry[] | LabelsValidationFailure,
): value is LabelsValidationFailure {
  return !Array.isArray(value);
}

interface LabelableProduct {
  name: string;
  internalBarcode: string | undefined;
}

async function labelableProductsById<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  productIds: string[],
): Promise<Map<string, LabelableProduct>> {
  const productRows = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(inArray(products.id, productIds));

  const barcodeRows = await db
    .select({ productId: productBarcodes.productId, code: productBarcodes.code })
    .from(productBarcodes)
    .where(inArray(productBarcodes.productId, productIds))
    .orderBy(asc(productBarcodes.position));

  const barcodesByProductId = new Map<string, string[]>();
  for (const row of barcodeRows) {
    const existing = barcodesByProductId.get(row.productId);
    if (existing) {
      existing.push(row.code);
    } else {
      barcodesByProductId.set(row.productId, [row.code]);
    }
  }

  const result = new Map<string, LabelableProduct>();
  for (const row of productRows) {
    const codes = barcodesByProductId.get(row.id) ?? [];
    result.set(row.id, { name: row.name, internalBarcode: codes.find(isInternalBarcode) });
  }
  return result;
}

/**
 * Registers `POST /products/labels`, gated by the `manage_products_and_categories` permission (an
 * Administrator always holds it too), the same access and origin-check shape `POST /products`
 * uses. Responds with a printable A4 PDF of the requested labels (`label-sheet-pdf.ts`), one per
 * product carrying its internal barcode (its first one, in position order), repeated its
 * requested count.
 */
export function registerProductLabelsRoute<TQueryResult extends PgQueryResultHKT>(
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
    "/products/labels",
    {
      preHandler: originGuard(checkOrigin),
      config: {
        access: permissionAccess("manage_products_and_categories"),
        sessionSource,
      },
    },
    async (request, reply) => {
      const parsedBody = readLabelsBody(request.body);
      if (isValidationFailure(parsedBody)) {
        await reply.code(400).send({
          code: "validation_failed",
          message: parsedBody.message,
          details: [{ field: parsedBody.field }],
        });
        return;
      }

      const productsById = await labelableProductsById(
        options.db,
        parsedBody.map((entry) => entry.productId),
      );

      const items: { name: string; code: string; count: number }[] = [];
      for (const entry of parsedBody) {
        const product = productsById.get(entry.productId);
        if (!product) {
          await reply.code(400).send({
            code: "product_not_found",
            message: "no product with that id",
            productId: entry.productId,
          });
          return;
        }
        if (!product.internalBarcode) {
          await reply.code(400).send({
            code: "product_without_internal_barcode",
            message: "this product has no internal barcode to print",
            productId: entry.productId,
          });
          return;
        }
        items.push({ name: product.name, code: product.internalBarcode, count: entry.count });
      }

      const pdf = await renderLabelSheetPdf(items);
      await reply
        .header("Content-Disposition", "attachment")
        .type("application/pdf")
        .code(200)
        .send(pdf);
    },
  );
}
