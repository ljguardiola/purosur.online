import { labelSheetBodySchema } from "@purosur/contracts";
import { isInternalBarcode } from "@purosur/domain";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { backofficeOriginGuard } from "../access/backoffice-origin.js";
import {
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { productBarcodes, products } from "../platform/db/schema.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { renderLabelSheetPdf } from "./label-sheet-pdf.js";
import type { ProductsRouteOptions } from "./products-list-route.js";

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
    .where(and(inArray(products.id, productIds), eq(products.active, true)));

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

export function registerProductLabelsRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: ProductsRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.post(
    "/label-sheets",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: {
        access: permissionAccess("manage_products_and_categories"),
        sessionSource,
      },
    },
    async (request, reply) => {
      const body = await readValidatedBody(reply, labelSheetBodySchema, request.body);
      if (!body) {
        return;
      }

      const productsById = await labelableProductsById(
        options.db,
        body.labels.map((entry) => entry.productId),
      );

      const items: { name: string; code: string; count: number }[] = [];
      for (const entry of body.labels) {
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
