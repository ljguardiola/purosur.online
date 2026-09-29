import { type StockBalanceList, stockBalanceListSchema } from "@purosur/contracts";
import type { SaleUnit } from "@purosur/domain";
import { and, asc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../access/backoffice-origin.js";
import {
  openSessionOf,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { categories, products, stockBalances } from "../platform/db/schema.js";
import type { StockRouteOptions } from "./stock-route-options.js";

async function listStockBalances<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  locationId: string,
): Promise<StockBalanceList> {
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      categoryId: products.categoryId,
      categoryName: categories.name,
      saleUnit: products.saleUnit,
      balance: sql<number>`coalesce(${stockBalances.quantity}, 0)`.mapWith(Number),
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(
      stockBalances,
      and(eq(stockBalances.productId, products.id), eq(stockBalances.locationId, locationId)),
    )
    .where(eq(products.active, true))
    .orderBy(asc(products.name), asc(products.id));
  return { products: rows.map((row) => ({ ...row, saleUnit: row.saleUnit as SaleUnit })) };
}

export function registerStockBalancesRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: StockRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.get(
    "/stock/balances",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: {
        // The count and movement forms show the balance of the product they are about to change.
        access: permissionAccess([
          "view_stock_balances",
          "perform_stock_counts",
          "adjust_stock",
          "record_stock_losses",
        ]),
        sessionSource,
      },
    },
    async (request, reply) => {
      const { locationId } = openSessionOf(request);
      const list = await listStockBalances(options.db, locationId);
      await reply.code(200).send(stockBalanceListSchema.parse(list));
    },
  );
}
