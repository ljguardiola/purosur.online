import { discountTargetsSchema } from "@purosur/contracts";
import type { NetContentUnit } from "@purosur/domain";
import { and, asc, eq } from "drizzle-orm";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../access/backoffice-origin.js";
import {
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { brands, categories, productBarcodes, products, tags } from "../platform/db/schema.js";
import type { DiscountsRouteOptions } from "./discounts-list-route.js";

export function registerDiscountTargetsRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: DiscountsRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.get(
    "/discount-targets",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: permissionAccess("manage_promotions"), sessionSource },
    },
    async (_request, reply) => {
      const [productRows, barcodeRows, categoryRows, tagRows] = await Promise.all([
        options.db
          .select({
            id: products.id,
            name: products.name,
            saleUnit: products.saleUnit,
            brandName: brands.name,
            netContentQuantity: products.netContentQuantity,
            netContentUnit: products.netContentUnit,
          })
          .from(products)
          .leftJoin(brands, eq(brands.id, products.brandId))
          .where(eq(products.active, true))
          .orderBy(asc(products.name)),
        options.db
          .select({ productId: productBarcodes.productId, code: productBarcodes.code })
          .from(productBarcodes)
          .innerJoin(products, eq(products.id, productBarcodes.productId))
          .where(and(eq(products.active, true), eq(productBarcodes.active, true)))
          .orderBy(asc(productBarcodes.position)),
        options.db
          .select({ id: categories.id, name: categories.name, parentId: categories.parentId })
          .from(categories)
          .orderBy(asc(categories.name)),
        options.db
          .select({ id: tags.id, name: tags.name })
          .from(tags)
          .where(eq(tags.active, true))
          .orderBy(asc(tags.name)),
      ]);
      const barcodesByProduct = new Map<string, string[]>();
      for (const { productId, code } of barcodeRows) {
        barcodesByProduct.set(productId, [...(barcodesByProduct.get(productId) ?? []), code]);
      }
      await reply.code(200).send(
        discountTargetsSchema.parse({
          products: productRows.map((row) => ({
            id: row.id,
            name: row.name,
            saleUnit: row.saleUnit,
            brandName: row.brandName,
            netContent:
              row.netContentQuantity === null || row.netContentUnit === null
                ? null
                : { quantity: row.netContentQuantity, unit: row.netContentUnit as NetContentUnit },
            barcodes: barcodesByProduct.get(row.id) ?? [],
          })),
          categories: categoryRows,
          tags: tagRows,
        }),
      );
    },
  );
}
