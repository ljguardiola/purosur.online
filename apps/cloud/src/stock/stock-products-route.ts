import { stockProductListSchema } from "@purosur/contracts";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../access/backoffice-origin.js";
import {
  capabilityAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { DrizzleStockReader } from "./drizzle-stock-reader.js";
import type { StockRouteOptions } from "./stock-route-options.js";

export function registerStockProductsRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: StockRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const reader = new DrizzleStockReader(options.db);

  app.get(
    "/inventory-items",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: {
        access: capabilityAccess("stock_area"),
        sessionSource,
      },
    },
    async (_request, reply) => {
      const products = await reader.activeProducts();
      await reply.code(200).send(stockProductListSchema.parse({ products }));
    },
  );
}
