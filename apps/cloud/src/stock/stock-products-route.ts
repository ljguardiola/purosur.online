import { stockProductListSchema } from "@purosur/contracts";
import { asc, eq } from "drizzle-orm";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../access/backoffice-origin.js";
import {
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { categories, products } from "../platform/db/schema.js";
import type { StockRouteOptions } from "./stock-route-options.js";

export function registerStockProductsRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: StockRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.get(
    "/stock/products",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: {
        access: permissionAccess([
          "view_stock_balances",
          "perform_stock_counts",
          "adjust_stock",
          "record_stock_losses",
        ]),
        sessionSource,
      },
    },
    async (_request, reply) => {
      const rows = await options.db
        .select({
          id: products.id,
          name: products.name,
          categoryId: products.categoryId,
          categoryName: categories.name,
          saleUnit: products.saleUnit,
        })
        .from(products)
        .innerJoin(categories, eq(products.categoryId, categories.id))
        .where(eq(products.active, true))
        .orderBy(asc(products.name), asc(products.id));
      await reply.code(200).send(stockProductListSchema.parse({ products: rows }));
    },
  );
}
