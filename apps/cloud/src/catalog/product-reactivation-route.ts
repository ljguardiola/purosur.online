import { reactivateProduct } from "@purosur/domain/catalog/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { readRecordIds } from "../platform/record-id-params.js";
import { backofficeOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleCatalogStore } from "./drizzle-catalog-store.js";
import { PRODUCT_NOT_FOUND_RESPONSE } from "./product-edit-route.js";
import type { ProductsRouteOptions } from "./products-list-route.js";

const ALREADY_ACTIVE_RESPONSE = {
  code: "product_already_active",
  message: "the product is already active",
} as const;

export function registerProductReactivationRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: ProductsRouteOptions<TQueryResult>,
): void {
  registerRouteAccess(app);
  const catalogStore = new DrizzleCatalogStore(options.db);
  const { now } = options;
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.delete(
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
      const outcome = await reactivateProduct(catalogStore, ids.id);

      if (outcome.kind === "not_found") {
        await reply.code(404).send(PRODUCT_NOT_FOUND_RESPONSE);
        return;
      }
      if (outcome.kind === "already_active") {
        await reply.code(409).send(ALREADY_ACTIVE_RESPONSE);
        return;
      }
      if (outcome.kind === "barcode_taken") {
        await reply.code(409).send({ code: "barcode_taken", codes: outcome.codes });
        return;
      }

      await reply.code(200).send();
    },
  );
}
