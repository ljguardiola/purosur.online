import { internalBarcodeSchema } from "@purosur/contracts";
import { allocateInternalBarcode } from "@purosur/domain/catalog/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { backofficeOriginGuard } from "../access/backoffice-origin.js";
import {
  capabilityAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { DrizzleInternalBarcodeStore } from "./drizzle-internal-barcode-store.js";
import type { ProductsRouteOptions } from "./products-list-route.js";

export function registerInternalBarcodeRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: ProductsRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const store = new DrizzleInternalBarcodeStore(options.db);

  app.post(
    "/internal-barcodes",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: {
        access: capabilityAccess("products_and_categories"),
        sessionSource,
      },
    },
    async (_request, reply) => {
      const outcome = await allocateInternalBarcode(store);
      await reply.code(200).send(internalBarcodeSchema.parse({ code: outcome.code }));
    },
  );
}
