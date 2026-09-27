import { asc } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { checkRequestIsSameOrigin } from "../access/open-session.js";
import {
  originGuard,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { categories } from "../platform/db/schema.js";

export interface CategoriesRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now?: () => Date;
}

export interface CategoryRow {
  id: string;
  name: string;
  version: number;
  parentId: string | null;
}

export async function listCategories<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
): Promise<CategoryRow[]> {
  return db
    .select({
      id: categories.id,
      name: categories.name,
      version: categories.version,
      parentId: categories.parentId,
    })
    .from(categories)
    .orderBy(asc(categories.name));
}

export function registerCategoriesListRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: CategoriesRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.get(
    "/categories",
    {
      preHandler: originGuard((request, reply) =>
        checkRequestIsSameOrigin(request, reply, options.backofficeOrigin),
      ),
      config: {
        access: permissionAccess("manage_products_and_categories"),
        sessionSource,
      },
    },
    async (_request, reply) => {
      const rows = await listCategories(options.db);
      await reply.code(200).send(rows);
    },
  );
}
