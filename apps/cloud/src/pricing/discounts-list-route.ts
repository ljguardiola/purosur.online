import { discountListSchema } from "@purosur/contracts";
import { listDiscounts } from "@purosur/domain/pricing/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleDiscountReader } from "./drizzle-discount-reader.js";

export interface DiscountsRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
}

export function registerDiscountsListRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: DiscountsRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const ports = { discounts: new DrizzleDiscountReader(options.db), clock: { now } };

  app.get(
    "/discounts",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("promotions"), sessionSource },
    },
    async (_request, reply) => {
      await reply
        .code(200)
        .send(discountListSchema.parse({ discounts: await listDiscounts(ports) }));
    },
  );
}
