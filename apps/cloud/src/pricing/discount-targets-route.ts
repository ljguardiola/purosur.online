import { discountTargetsSchema } from "@purosur/contracts";
import { asc, eq } from "drizzle-orm";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../access/backoffice-origin.js";
import {
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { categories, products, tags } from "../platform/db/schema.js";
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
      const [productRows, categoryRows, tagRows] = await Promise.all([
        options.db
          .select({ id: products.id, name: products.name })
          .from(products)
          .where(eq(products.active, true))
          .orderBy(asc(products.name)),
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
      await reply.code(200).send(
        discountTargetsSchema.parse({
          products: productRows,
          categories: categoryRows,
          tags: tagRows,
        }),
      );
    },
  );
}
