import { reactivateBrand } from "@purosur/domain/catalog/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { backofficeOriginGuard } from "../access/backoffice-origin.js";
import {
  capabilityAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { BRAND_NOT_FOUND_RESPONSE } from "./brand-edit-route.js";
import type { BrandsRouteOptions } from "./brands-list-route.js";
import { DrizzleCatalogStore } from "./drizzle-catalog-store.js";

const ALREADY_ACTIVE_RESPONSE = {
  code: "brand_already_active",
  message: "the brand is already active",
} as const;

export function registerBrandReactivationRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: BrandsRouteOptions<TQueryResult>,
): void {
  registerRouteAccess(app);
  const catalogStore = new DrizzleCatalogStore(options.db);
  const now = options.now ?? (() => new Date());
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.delete<{ Params: { id: string } }>(
    "/brands/:id/deactivation",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("products_and_categories"), sessionSource },
    },
    async (request, reply) => {
      const targetId = request.params.id;
      const outcome = await reactivateBrand(catalogStore, targetId);

      if (outcome.kind === "not_found") {
        await reply.code(404).send(BRAND_NOT_FOUND_RESPONSE);
        return;
      }
      if (outcome.kind === "already_active") {
        await reply.code(409).send(ALREADY_ACTIVE_RESPONSE);
        return;
      }

      await reply.code(200).send();
    },
  );
}
