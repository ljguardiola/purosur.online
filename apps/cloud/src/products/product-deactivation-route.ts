import { eq } from "drizzle-orm";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { productBarcodes, products } from "../db/schema.js";
import {
  originGuard,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../session/route-access.js";
import { UUID_PATTERN } from "./product-validation.js";
import type { ProductsRouteOptions } from "./products-list-route.js";

const NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no product with that id",
} as const;

type DeactivationOutcome = { kind: "not_found" } | { kind: "deactivated" };

/**
 * Registers `POST /products/:id/deactivation`, gated by the `manage_products_and_categories`
 * permission (an Administrator always holds it too), the same access and origin-check shape
 * `POST /products` and `POST /products/:id/edit` use. Unlike a user's own deactivation, this needs
 * no passkey step-up (#309 only asks for the permission). A product is never deleted, only
 * deactivated (the migration's trigger rejects any `DELETE` on `products` outright), so history
 * that already references it stays intact.
 */
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
        // Locks this row before checking it, the same way `user-deactivation-route.ts` does: a
        // concurrent deactivation of the same product waits instead of racing, and re-reads
        // `active` under the lock so a second request against an already-deactivated product
        // never re-deactivates its barcodes or re-bumps its version.
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

        // Mirrors the product's own flag onto its barcodes (schema.ts comment on
        // `productBarcodes`): frees every code it held for reuse by a different, active product.
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
