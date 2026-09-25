import { asc } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { categories } from "../db/schema.js";
import { checkRequestIsSameOrigin } from "../session/open-session.js";
import {
  originGuard,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../session/route-access.js";

export interface CategoriesRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  /** Injected in tests so idle/absolute expiry are checked against a deterministic clock. */
  now?: () => Date;
}

export interface CategoryRow {
  id: string;
  name: string;
  version: number;
}

export async function listCategories<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
): Promise<CategoryRow[]> {
  return db
    .select({ id: categories.id, name: categories.name, version: categories.version })
    .from(categories)
    .orderBy(asc(categories.name));
}

/**
 * Registers `GET /categories`: gated by the `manage_products_and_categories` permission (an
 * Administrator always holds it too), the same open-session shape `GET /roles` uses.
 */
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
