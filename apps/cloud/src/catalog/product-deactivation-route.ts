import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  originGuard,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { productBarcodes, products } from "../platform/db/schema.js";
import { UUID_PATTERN } from "../platform/db/uuid-pattern.js";
import type { ProductsRouteOptions } from "./products-list-route.js";

const NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no product with that id",
} as const;

export type DeactivateProductOutcome = { kind: "not_found" } | { kind: "deactivated" };

// A database trigger rejects any `DELETE` on `products` outright, so a product is never deleted, only deactivated.
export async function deactivateProduct<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  productId: string,
): Promise<DeactivateProductOutcome> {
  return db.transaction<DeactivateProductOutcome>(async (tx) => {
    // Locks and re-reads `active` under the lock, so a concurrent deactivation of the same
    // product waits instead of racing, and a second request never re-deactivates it.
    const [current] = await tx
      .select({ active: products.active, version: products.version })
      .from(products)
      .where(eq(products.id, productId))
      .for("update");
    if (!current?.active) {
      return { kind: "not_found" };
    }

    await tx
      .update(products)
      .set({ active: false, version: current.version + 1 })
      .where(eq(products.id, productId));

    await tx
      .update(productBarcodes)
      .set({ active: false })
      .where(eq(productBarcodes.productId, productId));

    return { kind: "deactivated" };
  });
}

export function registerProductDeactivationRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: ProductsRouteOptions<TQueryResult>,
): void {
  registerRouteAccess(app);
  const now = options.now ?? (() => new Date());
  const sessionSource = routeSessionSource({ db: options.db, now });

  function checkOrigin(request: FastifyRequest, reply: FastifyReply): boolean {
    if (request.headers.origin !== options.backofficeOrigin) {
      void reply.code(403).send({
        code: "origin_rejected",
        message: "the request's Origin does not match the backoffice's own origin",
      });
      return false;
    }
    return true;
  }

  app.post<{ Params: { id: string } }>(
    "/products/:id/deactivation",
    {
      preHandler: originGuard(checkOrigin),
      config: { access: permissionAccess("manage_products_and_categories"), sessionSource },
    },
    async (request, reply) => {
      const targetId = request.params.id;
      if (!UUID_PATTERN.test(targetId)) {
        await reply.code(404).send(NOT_FOUND_RESPONSE);
        return;
      }

      const outcome = await deactivateProduct(options.db, targetId);

      if (outcome.kind === "not_found") {
        await reply.code(404).send(NOT_FOUND_RESPONSE);
        return;
      }

      await reply.code(200).send();
    },
  );
}
