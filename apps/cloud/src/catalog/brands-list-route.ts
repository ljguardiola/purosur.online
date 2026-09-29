import { type BrandSummary, brandListSchema } from "@purosur/contracts";
import { and, asc, count, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../access/backoffice-origin.js";
import {
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { brands, products } from "../platform/db/schema.js";

export interface BrandsRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now?: () => Date;
}

// Only active products count: a deactivated product is no longer part of the catalog.
export async function listBrands<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  brandId?: string,
): Promise<BrandSummary[]> {
  return db
    .select({
      id: brands.id,
      name: brands.name,
      active: brands.active,
      version: brands.version,
      productCount: count(products.id),
    })
    .from(brands)
    .leftJoin(products, and(eq(products.brandId, brands.id), eq(products.active, true)))
    .where(brandId === undefined ? undefined : eq(brands.id, brandId))
    .groupBy(brands.id)
    .orderBy(asc(brands.name));
}

export function registerBrandsListRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: BrandsRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.get(
    "/brands",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: {
        access: permissionAccess("manage_products_and_categories"),
        sessionSource,
      },
    },
    async (_request, reply) => {
      const rows = await listBrands(options.db);
      await reply.code(200).send(brandListSchema.parse(rows));
    },
  );
}
