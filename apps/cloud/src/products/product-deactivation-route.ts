import { eq } from "drizzle-orm";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { productBarcodes, products } from "../db/schema.js";
import { UUID_PATTERN } from "../db/uuid-pattern.js";
import {
  originGuard,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../session/route-access.js";
import type { ProductsRouteOptions } from "./products-list-route.js";

const NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no product with that id",
} as const;

type DeactivationOutcome = { kind: "not_found" } | { kind: "deactivated" };

// A database trigger rejects any `DELETE` on `products` outright, so a product is never deleted, only deactivated.
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

      const outcome = await options.db.transaction<DeactivationOutcome>(async (tx) => {
        // Locks and re-reads `active` under the lock, so a concurrent deactivation of the same
        // product waits instead of racing, and a second request never re-deactivates it.
        const [current] = await tx
          .select({ active: products.active, version: products.version })
          .from(products)
          .where(eq(products.id, targetId))
          .for("update");
        if (!current?.active) {
          return { kind: "not_found" };
        }

        await tx
          .update(products)
          .set({ active: false, version: current.version + 1 })
          .where(eq(products.id, targetId));

        await tx
          .update(productBarcodes)
          .set({ active: false })
          .where(eq(productBarcodes.productId, targetId));

        return { kind: "deactivated" };
      });

      if (outcome.kind === "not_found") {
        await reply.code(404).send(NOT_FOUND_RESPONSE);
        return;
      }

      await reply.code(200).send();
    },
  );
}
