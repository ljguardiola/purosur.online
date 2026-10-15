import { stockBalanceListSchema } from "@purosur/contracts";
import { readStockBalances } from "@purosur/domain/stock/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleStockReader } from "./drizzle-stock-reader.js";
import type { StockRouteOptions } from "./stock-route-options.js";

export function registerStockBalancesRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: StockRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const reader = new DrizzleStockReader(options.db);

  app.get(
    "/inventory-levels",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("stock_balances"), sessionSource },
    },
    async (request, reply) => {
      const { locationId } = openSessionOf(request);
      const balances = await readStockBalances({ stockList: reader }, { locationId });
      await reply.code(200).send(
        stockBalanceListSchema.parse({
          ...balances,
          products: balances.products.map((product) => ({
            ...product,
            lots: product.lots.map((lot) => ({
              ...lot,
              origin:
                lot.origin.kind === "assembly_batch"
                  ? { ...lot.origin, assembledAt: lot.origin.assembledAt.toISOString() }
                  : lot.origin,
            })),
          })),
        }),
      );
    },
  );
}
