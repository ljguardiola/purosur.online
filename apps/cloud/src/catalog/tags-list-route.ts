import { type TagSummary, tagListSchema } from "@purosur/contracts";
import { and, asc, count, countDistinct, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../access/backoffice-origin.js";
import {
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { products, productTags, tags } from "../platform/db/schema.js";

export interface TagsRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now?: () => Date;
}

// Only active products count: a deactivated product is no longer part of the catalog.
export async function listTags<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  tagId?: string,
): Promise<TagSummary[]> {
  return db
    .select({
      id: tags.id,
      name: tags.name,
      active: tags.active,
      version: tags.version,
      productCount: count(products.id),
    })
    .from(tags)
    .leftJoin(productTags, eq(productTags.tagId, tags.id))
    .leftJoin(products, and(eq(products.id, productTags.productId), eq(products.active, true)))
    .where(tagId === undefined ? undefined : eq(tags.id, tagId))
    .groupBy(tags.id)
    .orderBy(asc(tags.name));
}

async function countTaggedProducts<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
): Promise<number> {
  const [row] = await db
    .select({ taggedProductCount: countDistinct(products.id) })
    .from(productTags)
    .innerJoin(products, and(eq(products.id, productTags.productId), eq(products.active, true)));
  return row?.taggedProductCount ?? 0;
}

export function registerTagsListRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: TagsRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.get(
    "/tags",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: {
        access: permissionAccess("manage_products_and_categories"),
        sessionSource,
      },
    },
    async (_request, reply) => {
      const [rows, taggedProductCount] = await Promise.all([
        listTags(options.db),
        countTaggedProducts(options.db),
      ]);
      await reply.code(200).send(tagListSchema.parse({ tags: rows, taggedProductCount }));
    },
  );
}
