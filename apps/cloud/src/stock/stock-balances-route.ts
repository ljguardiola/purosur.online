import { stockBalanceListSchema } from "@purosur/contracts";
import { readStockBalances } from "@purosur/domain/stock/use-cases";
import { formatLotName } from "@purosur/formatting";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleLotNameReader } from "./drizzle-lot-name-reader.js";
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
  const lotNames = new DrizzleLotNameReader(options.db);

  app.get(
    "/inventory-levels",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("stock_balances"), sessionSource },
    },
    async (request, reply) => {
      const { locationId } = openSessionOf(request);
      const balances = await readStockBalances(
        { stockList: reader, lotNames, zoneRules: options.zoneRules },
        { locationId },
      );
      await reply.code(200).send(
        stockBalanceListSchema.parse({
          ...balances,
          products: balances.products.map((product) => ({
            ...product,
            lots: product.lots.map(({ name, code: _code, ...lot }) => ({
              ...lot,
              lotName: formatLotName(name),
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
