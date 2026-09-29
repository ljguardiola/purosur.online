import { brandEditBodySchema, brandSummarySchema } from "@purosur/contracts";
import { editBrand } from "@purosur/domain/catalog/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { backofficeOriginGuard } from "../access/backoffice-origin.js";
import {
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { brands } from "../platform/db/schema.js";
import { UUID_PATTERN } from "../platform/db/uuid-pattern.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { BRAND_NAME_TAKEN_RESPONSE } from "./brand-creation-route.js";
import { type BrandsRouteOptions, listBrands } from "./brands-list-route.js";
import { DrizzleCatalogStore } from "./drizzle-catalog-store.js";

export const BRAND_NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no brand with that id",
} as const;

const STALE_VERSION_RESPONSE = {
  code: "stale_version",
  message: "this brand was changed since it was loaded",
} as const;

async function findBrandById<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  id: string,
): Promise<{ id: string } | undefined> {
  if (!UUID_PATTERN.test(id)) {
    return undefined;
  }
  const [brand] = await db.select({ id: brands.id }).from(brands).where(eq(brands.id, id));
  return brand;
}

export function registerBrandEditRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: BrandsRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const catalogStore = new DrizzleCatalogStore(options.db);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.post<{ Params: { id: string } }>(
    "/brands/:id/edit",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: {
        access: permissionAccess("manage_products_and_categories"),
        sessionSource,
      },
    },
    async (request, reply) => {
      const target = await findBrandById(options.db, request.params.id);
      if (!target) {
        await reply.code(404).send(BRAND_NOT_FOUND_RESPONSE);
        return;
      }

      const parsedBody = await readValidatedBody(reply, brandEditBodySchema, request.body);
      if (!parsedBody) {
        return;
      }

      const outcome = await editBrand(catalogStore, { id: target.id, ...parsedBody });

      if (outcome.kind === "stale_version") {
        await reply.code(409).send(STALE_VERSION_RESPONSE);
        return;
      }
      if (outcome.kind === "name_taken") {
        await reply.code(409).send(BRAND_NAME_TAKEN_RESPONSE);
        return;
      }

      const [listed] = await listBrands(options.db, target.id);
      await reply
        .code(200)
        .send(
          brandSummarySchema.parse({ ...outcome.brand, productCount: listed?.productCount ?? 0 }),
        );
    },
  );
}
