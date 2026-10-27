import { internalBarcodeGenerationBodySchema, internalBarcodeSchema } from "@purosur/contracts";
import { allocateInternalBarcode } from "@purosur/domain/catalog/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { backofficeOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleInternalBarcodeStore } from "./drizzle-internal-barcode-store.js";
import type { ProductsRouteOptions } from "./products-list-route.js";

export function allocateInternalBarcodeHandler<TQueryResult extends PgQueryResultHKT>(
  store: DrizzleInternalBarcodeStore<TQueryResult>,
) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const parsedBody = await readValidatedBody(
      reply,
      internalBarcodeGenerationBodySchema,
      request.body,
    );
    if (!parsedBody) {
      return;
    }
    const outcome = await allocateInternalBarcode(store);
    await reply.code(200).send(internalBarcodeSchema.parse({ code: outcome.code }));
  };
}

export function registerInternalBarcodeRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: ProductsRouteOptions<TQueryResult>,
): void {
  const { now } = options;
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
    allocateInternalBarcodeHandler(store),
  );
}
