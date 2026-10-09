import { discountTargetsSchema } from "@purosur/contracts";
import { listDiscountTargets } from "@purosur/domain/pricing/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import type { DiscountsRouteOptions } from "./discounts-list-route.js";
import { DrizzleDiscountTargetReader } from "./drizzle-discount-target-reader.js";

export function registerDiscountTargetsRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: DiscountsRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const targets = new DrizzleDiscountTargetReader(options.db);

  app.get(
    "/discount-targets",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("promotions"), sessionSource },
    },
    async (_request, reply) => {
      await reply
        .code(200)
        .send(discountTargetsSchema.parse(await listDiscountTargets({ targets })));
    },
  );
}
