import { productListSchema } from "@purosur/contracts";
import type { ProductActivityScope } from "@purosur/domain/catalog/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../access/backoffice-origin.js";
import {
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { DrizzleCatalogListReader } from "./drizzle-catalog-list-reader.js";
import { toProductSummary } from "./product-summary-wire.js";

const PRODUCT_STATUS_SCOPES: Record<string, ProductActivityScope> = {
  active: "active",
  inactive: "inactive",
  all: "any",
};

function readProductStatusScope(
  raw: unknown,
): ProductActivityScope | { field: "status"; message: string } {
  if (raw === undefined) {
    return "active";
  }
  const scope = typeof raw === "string" ? PRODUCT_STATUS_SCOPES[raw] : undefined;
  if (scope) {
    return scope;
  }
  return { field: "status", message: "status must be one of active, inactive, or all" };
}

export interface ProductsRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now?: () => Date;
}

export function registerProductsListRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: ProductsRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const catalog = new DrizzleCatalogListReader(options.db);

  app.get<{ Querystring: { status?: string } }>(
    "/products",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: {
        access: permissionAccess("manage_products_and_categories"),
        sessionSource,
      },
    },
    async (request, reply) => {
      const scope = readProductStatusScope(request.query.status);
      if (typeof scope !== "string") {
        await reply.code(400).send({
          code: "validation_failed",
          message: scope.message,
          details: [{ field: scope.field }],
        });
        return;
      }

      const rows = await catalog.products(scope);
      await reply.code(200).send(productListSchema.parse(rows.map(toProductSummary)));
    },
  );
}
