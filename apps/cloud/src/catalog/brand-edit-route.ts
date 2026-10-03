import { brandEditBodySchema, brandSummarySchema } from "@purosur/contracts";
import { editBrand, findBrandSummary } from "@purosur/domain/catalog/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { backofficeOriginGuard } from "../access/backoffice-origin.js";
import {
  capabilityAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { readRecordIds } from "../platform/record-id-params.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { BRAND_NAME_TAKEN_RESPONSE } from "./brand-creation-route.js";
import type { BrandsRouteOptions } from "./brands-list-route.js";
import { DrizzleCatalogListReader } from "./drizzle-catalog-list-reader.js";
import { DrizzleCatalogStore } from "./drizzle-catalog-store.js";

export const BRAND_NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no brand with that id",
} as const;

const STALE_VERSION_RESPONSE = {
  code: "stale_version",
  message: "this brand was changed since it was loaded",
} as const;

export function registerBrandEditRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: BrandsRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const catalogStore = new DrizzleCatalogStore(options.db);
  const catalog = new DrizzleCatalogListReader(options.db);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.put(
    "/brands/:id",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: {
        access: capabilityAccess("products_and_categories"),
        sessionSource,
      },
    },
    async (request, reply) => {
      const ids = await readRecordIds(reply, request.params, ["id"]);
      if (!ids) {
        return;
      }
      const parsedBody = await readValidatedBody(reply, brandEditBodySchema, request.body);
      if (!parsedBody) {
        return;
      }

      const outcome = await editBrand(catalogStore, { id: ids.id, ...parsedBody });

      if (outcome.kind === "not_found") {
        await reply.code(404).send(BRAND_NOT_FOUND_RESPONSE);
        return;
      }
      if (outcome.kind === "stale_version") {
        await reply.code(409).send(STALE_VERSION_RESPONSE);
        return;
      }
      if (outcome.kind === "name_taken") {
        await reply.code(409).send(BRAND_NAME_TAKEN_RESPONSE);
        return;
      }

      const listed = await findBrandSummary({ catalog }, ids.id);
      await reply
        .code(200)
        .send(
          brandSummarySchema.parse({ ...outcome.brand, productCount: listed?.productCount ?? 0 }),
        );
    },
  );
}
