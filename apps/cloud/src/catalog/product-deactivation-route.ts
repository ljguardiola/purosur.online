import { deactivateProduct } from "@purosur/domain/catalog/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { backofficeOriginGuard } from "../access/backoffice-origin.js";
import {
  capabilityAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { readRecordIds } from "../platform/record-id-params.js";
import { DrizzleCatalogStore } from "./drizzle-catalog-store.js";
import type { ProductsRouteOptions } from "./products-list-route.js";

const NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no product with that id",
} as const;

export function registerProductDeactivationRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: ProductsRouteOptions<TQueryResult>,
): void {
  registerRouteAccess(app);
  const catalogStore = new DrizzleCatalogStore(options.db);
  const { now } = options;
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.put(
    "/products/:id/deactivation",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("products_and_categories"), sessionSource },
    },
    async (request, reply) => {
      const ids = await readRecordIds(reply, request.params, ["id"]);
      if (!ids) {
        return;
      }
      const targetId = ids.id;
      const outcome = await deactivateProduct(catalogStore, targetId);

      if (outcome.kind === "not_found") {
        await reply.code(404).send(NOT_FOUND_RESPONSE);
        return;
      }

      await reply.code(200).send();
    },
  );
}
