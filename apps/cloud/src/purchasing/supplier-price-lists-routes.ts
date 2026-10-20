import {
  supplierPriceListConfirmationBodySchema,
  supplierPriceListDiscardBodySchema,
  supplierPriceListListSchema,
  supplierPriceListReviewSchema,
  supplierPriceListRowPriceBodySchema,
  supplierPriceListRowRemovalBodySchema,
  supplierPriceListUploadedSchema,
  supplierPriceListUploadQuerySchema,
} from "@purosur/contracts";
import { SUPPLIER_PRICE_LIST_PDF_MAX_BYTES } from "@purosur/domain";
import {
  confirmSupplierPriceList,
  discardSupplierPriceList,
  findSupplierPriceListFile,
  findSupplierPriceListReview,
  listSupplierPriceLists,
  removeSupplierPriceListRow,
  setSupplierPriceListRowPrice,
  uploadSupplierPriceList,
} from "@purosur/domain/purchasing/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyError, FastifyInstance, FastifyReply } from "fastify";
import { readRecordIds } from "../platform/record-id-params.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { backofficeOriginGuard, sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleSupplierPriceListReader } from "./drizzle-supplier-price-list-reader.js";
import { DrizzleSupplierPriceListStore } from "./drizzle-supplier-price-list-store.js";
import { hasPdfSignature } from "./pdf-signature.js";
import type { PurchasingRouteOptions } from "./purchasing-route-options.js";

const NOT_FOUND = { code: "not_found", message: "no supplier price list with that id" } as const;
const STALE_VERSION = {
  code: "stale_version",
  message: "this supplier price list was changed since it was loaded",
} as const;
const NOT_EDITABLE = {
  code: "not_editable",
  message: "this supplier price list can no longer be changed",
} as const;
const FILE_TOO_LARGE = {
  code: "file_too_large",
  message: "the file is over the maximum size",
} as const;
const NOT_A_PDF = { code: "not_a_pdf", message: "the file is not a PDF" } as const;
const READING_UNAVAILABLE = {
  code: "supplier_price_list_reading_unavailable",
  message: "reading supplier price lists is not available",
} as const;

const CONFIRMATION_REFUSALS = {
  no_rows: "the list has no rows to confirm",
  unpriced_rows: "some rows have no price",
  list_date_missing: "the list has no date",
} as const;

function contentDisposition(fileName: string): string {
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename*=UTF-8''${encoded}`;
}

async function refuseChange(
  reply: FastifyReply,
  outcome: { kind: "not_found" | "not_editable" | "stale_version" },
): Promise<void> {
  if (outcome.kind === "not_found") {
    await reply.code(404).send(NOT_FOUND);
    return;
  }
  await reply.code(409).send(outcome.kind === "stale_version" ? STALE_VERSION : NOT_EDITABLE);
}

export function registerSupplierPriceListsRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: PurchasingRouteOptions<TQueryResult>,
): void {
  const { now, supplierPriceListFiles: files } = options;
  registerRouteAccess(app);
  const store = new DrizzleSupplierPriceListStore(options.db, now);
  const reader = new DrizzleSupplierPriceListReader(options.db);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const config = { access: capabilityAccess("supplier_price_lists"), sessionSource };
  const readGuard = { preHandler: sameOriginGuard(options.backofficeOrigin), config };
  const writeGuard = { preHandler: backofficeOriginGuard(options.backofficeOrigin), config };

  app.register(async (upload) => {
    upload.removeAllContentTypeParsers();
    upload.addContentTypeParser("*", { parseAs: "buffer" }, (_request, body, done) => {
      done(null, body);
    });
    upload.setErrorHandler(async (error: FastifyError, _request, reply) => {
      if (error.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
        await reply.code(413).send(FILE_TOO_LARGE);
        return;
      }
      throw error;
    });

    upload.post(
      "/supplier-price-lists",
      { ...writeGuard, bodyLimit: SUPPLIER_PRICE_LIST_PDF_MAX_BYTES + 1 },
      async (request, reply) => {
        const query = await readValidatedBody(
          reply,
          supplierPriceListUploadQuerySchema,
          request.query,
        );
        if (!query) {
          return;
        }
        const pdf = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
        if (!hasPdfSignature(pdf)) {
          await reply.code(415).send(NOT_A_PDF);
          return;
        }
        if (!files) {
          await reply.code(503).send(READING_UNAVAILABLE);
          return;
        }

        const openSession = openSessionOf(request);
        const outcome = await uploadSupplierPriceList(
          { store, files },
          {
            supplierId: query.supplierId,
            locationId: openSession.locationId,
            fileName: query.fileName,
            pdf,
            actorId: openSession.userId,
            now: now(),
          },
        );

        switch (outcome.kind) {
          case "file_too_large":
            await reply.code(413).send(FILE_TOO_LARGE);
            return;
          case "supplier_not_found":
            await reply
              .code(404)
              .send({ code: "supplier_not_found", message: "no supplier with that id" });
            return;
          case "supplier_inactive":
            await reply
              .code(409)
              .send({ code: "supplier_inactive", message: "the supplier is deactivated" });
            return;
          case "daily_cap_reached":
            await reply.code(409).send({
              code: "daily_cap_reached",
              message: "the branch reached its daily limit of price list readings",
              cap: outcome.cap,
            });
            return;
          case "uploaded":
            await reply
              .code(201)
              .send(supplierPriceListUploadedSchema.parse({ listId: outcome.listId }));
            return;
        }
      },
    );
  });

  app.get("/supplier-price-lists", readGuard, async (_request, reply) => {
    const lists = await listSupplierPriceLists(reader);
    await reply
      .code(200)
      .send(
        supplierPriceListListSchema.parse(
          lists.map((list) => ({ ...list, uploadedAt: list.uploadedAt.toISOString() })),
        ),
      );
  });

  app.get("/supplier-price-lists/:id", readGuard, async (request, reply) => {
    const ids = await readRecordIds(reply, request.params, ["id"]);
    if (!ids) {
      return;
    }
    const found = await findSupplierPriceListReview(reader, ids.id);
    if (found.kind === "not_found") {
      await reply.code(404).send(NOT_FOUND);
      return;
    }
    await reply.code(200).send(
      supplierPriceListReviewSchema.parse({
        list: { ...found.list, uploadedAt: found.list.uploadedAt.toISOString() },
        rows: found.rows,
        actions: found.actions,
      }),
    );
  });

  app.get("/supplier-price-lists/:id/file", readGuard, async (request, reply) => {
    const ids = await readRecordIds(reply, request.params, ["id"]);
    if (!ids) {
      return;
    }
    if (!files) {
      await reply.code(503).send(READING_UNAVAILABLE);
      return;
    }
    const found = await findSupplierPriceListFile({ reader, files }, ids.id);
    if (found.kind === "not_found") {
      await reply.code(404).send(NOT_FOUND);
      return;
    }
    await reply
      .code(200)
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", contentDisposition(found.fileName))
      .header("X-Content-Type-Options", "nosniff")
      .header("Content-Security-Policy", "sandbox")
      .header("Cache-Control", "no-store")
      .send(Buffer.from(found.bytes));
  });

  app.put("/supplier-price-lists/:id/rows/:rowId/price", writeGuard, async (request, reply) => {
    const ids = await readRecordIds(reply, request.params, ["id", "rowId"]);
    if (!ids) {
      return;
    }
    const body = await readValidatedBody(reply, supplierPriceListRowPriceBodySchema, request.body);
    if (!body) {
      return;
    }
    const outcome = await setSupplierPriceListRowPrice(store, {
      listId: ids.id,
      rowId: ids.rowId,
      priceCents: body.priceCents,
      version: body.version,
      actorId: openSessionOf(request).userId,
    });
    if (outcome.kind !== "updated") {
      await refuseChange(reply, outcome);
      return;
    }
    await reply.code(200).send();
  });

  app.delete("/supplier-price-lists/:id/rows/:rowId", writeGuard, async (request, reply) => {
    const ids = await readRecordIds(reply, request.params, ["id", "rowId"]);
    if (!ids) {
      return;
    }
    const body = await readValidatedBody(
      reply,
      supplierPriceListRowRemovalBodySchema,
      request.body,
    );
    if (!body) {
      return;
    }
    const outcome = await removeSupplierPriceListRow(store, {
      listId: ids.id,
      rowId: ids.rowId,
      version: body.version,
      actorId: openSessionOf(request).userId,
    });
    if (outcome.kind !== "removed") {
      await refuseChange(reply, outcome);
      return;
    }
    await reply.code(200).send();
  });

  app.post("/supplier-price-lists/:id/confirmation", writeGuard, async (request, reply) => {
    const ids = await readRecordIds(reply, request.params, ["id"]);
    if (!ids) {
      return;
    }
    const body = await readValidatedBody(
      reply,
      supplierPriceListConfirmationBodySchema,
      request.body,
    );
    if (!body) {
      return;
    }
    const outcome = await confirmSupplierPriceList(store, {
      listId: ids.id,
      version: body.version,
      listDate: body.listDate,
      actorId: openSessionOf(request).userId,
      now: now(),
    });
    if (outcome.kind === "confirmed") {
      await reply.code(200).send();
      return;
    }
    if (
      outcome.kind === "no_rows" ||
      outcome.kind === "unpriced_rows" ||
      outcome.kind === "list_date_missing"
    ) {
      await reply
        .code(409)
        .send({ code: outcome.kind, message: CONFIRMATION_REFUSALS[outcome.kind] });
      return;
    }
    await refuseChange(reply, outcome);
  });

  app.post("/supplier-price-lists/:id/discard", writeGuard, async (request, reply) => {
    const ids = await readRecordIds(reply, request.params, ["id"]);
    if (!ids) {
      return;
    }
    const body = await readValidatedBody(reply, supplierPriceListDiscardBodySchema, request.body);
    if (!body) {
      return;
    }
    const outcome = await discardSupplierPriceList(store, {
      listId: ids.id,
      version: body.version,
      actorId: openSessionOf(request).userId,
      now: now(),
    });
    if (outcome.kind !== "discarded") {
      await refuseChange(reply, outcome);
      return;
    }
    await reply.code(200).send();
  });
}
