import { labelSheetBodySchema, printerLabelsSchema } from "@purosur/contracts";
import { prepareLabelSheet } from "@purosur/domain/catalog/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sendGzippedJson } from "../platform/gzip-reply.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { backofficeOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleLabelProductReader } from "./drizzle-label-product-reader.js";
import {
  PRINTER_LABEL_HEIGHT_DOTS,
  PRINTER_LABEL_WIDTH_DOTS,
  renderPrinterLabelRaster,
} from "./printer-label-raster.js";
import type { ProductsRouteOptions } from "./products-list-route.js";

export function registerProductLabelPrintsRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: ProductsRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const reader = new DrizzleLabelProductReader(options.db);

  app.post(
    "/label-prints",
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

      const answer = printerLabelsSchema.parse({
        widthDots: PRINTER_LABEL_WIDTH_DOTS,
        heightDots: PRINTER_LABEL_HEIGHT_DOTS,
        labels: outcome.items.map((item) => ({
          copies: item.count,
          rows: Buffer.from(renderPrinterLabelRaster(item)).toString("base64"),
        })),
      });
      await sendGzippedJson(request, reply, 200, answer);
    },
  );
}
