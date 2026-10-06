import { brandCreationBodySchema, brandSummarySchema } from "@purosur/contracts";
import { createBrand } from "@purosur/domain/catalog/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { backofficeOriginGuard } from "../access/backoffice-origin.js";
import {
  capabilityAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import type { BrandsRouteOptions } from "./brands-list-route.js";
import { DrizzleCatalogStore } from "./drizzle-catalog-store.js";

export const BRAND_NAME_TAKEN_RESPONSE = {
  code: "brand_name_taken",
  message: "a brand with that name already exists",
} as const;

export function registerBrandCreationRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: BrandsRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const catalogStore = new DrizzleCatalogStore(options.db);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.post(
    "/brands",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: {
        access: capabilityAccess("products_and_categories"),
        sessionSource,
      },
    },
    async (request, reply) => {
      const parsedBody = await readValidatedBody(reply, brandCreationBodySchema, request.body);
      if (!parsedBody) {
        return;
      }

      const outcome = await createBrand(catalogStore, parsedBody);

      if (outcome.kind === "name_taken") {
        await reply.code(409).send(BRAND_NAME_TAKEN_RESPONSE);
        return;
      }

      await reply.code(201).send(brandSummarySchema.parse({ ...outcome.brand, productCount: 0 }));
    },
  );
}
