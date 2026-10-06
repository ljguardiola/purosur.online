import { labelSheetBodySchema } from "@purosur/contracts";
import { prepareLabelSheet } from "@purosur/domain/catalog/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { backofficeOriginGuard } from "../access/backoffice-origin.js";
import {
  capabilityAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { DrizzleLabelProductReader } from "./drizzle-label-product-reader.js";
import { renderLabelSheetPdf } from "./label-sheet-pdf.js";
import type { ProductsRouteOptions } from "./products-list-route.js";

export function registerProductLabelsRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: ProductsRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const reader = new DrizzleLabelProductReader(options.db);

  app.post(
    "/label-sheets",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: {
        access: capabilityAccess("products_and_categories"),
        sessionSource,
      },
    },
    async (request, reply) => {
      const body = await readValidatedBody(reply, labelSheetBodySchema, request.body);
      if (!body) {
        return;
      }

      const outcome = await prepareLabelSheet(reader, body.labels);
      if (outcome.kind === "product_not_found") {
        await reply.code(400).send({
          code: "product_not_found",
          message: "no product with that id",
          productId: outcome.productId,
        });
        return;
      }
      if (outcome.kind === "product_without_internal_barcode") {
        await reply.code(400).send({
          code: "product_without_internal_barcode",
          message: "this product has no internal barcode to print",
          productId: outcome.productId,
        });
        return;
      }

      const pdf = await renderLabelSheetPdf(outcome.items);
      await reply
        .header("Content-Disposition", "attachment")
        .type("application/pdf")
        .code(200)
        .send(pdf);
    },
  );
}
