import {
  brandListSchema,
  categoryListSchema,
  supplierItemLinkChoicesSchema,
  supplierItemLinkProposalSchema,
  supplierPriceListAiCostSchema,
  supplierPriceListConfirmationBodySchema,
  supplierPriceListDiscardBodySchema,
  supplierPriceListListSchema,
  supplierPriceListPageRefusedSchema,
  supplierPriceListRereadStartedSchema,
  supplierPriceListReviewSchema,
  supplierPriceListRowLinkBodySchema,
  supplierPriceListRowPriceBodySchema,
  supplierPriceListRowProductCreatedSchema,
  supplierPriceListRowProductCreationBodySchema,
  supplierPriceListRowRemovalBodySchema,
  supplierPriceListRowReviewBodySchema,
  supplierPriceListUploadedSchema,
  supplierPriceListUploadQuerySchema,
  supplierPriceListWebPageBodySchema,
  tagListSchema,
} from "@purosur/contracts";
import {
  PRODUCTS_PACKAGINGS_MAY_BE_DEFINED_FOR,
  SUPPLIER_PRICE_LIST_PDF_MAX_BYTES,
} from "@purosur/domain";
import { listBrands, listTags } from "@purosur/domain/catalog/use-cases";
import type {
  CreateProductFromSupplierItemOutcome,
  LinkSupplierPriceListRowOutcome,
  LoadSupplierPriceListWebPageOutcome,
  ProductChooser,
} from "@purosur/domain/purchasing/use-cases";
import {
  confirmSupplierPriceList,
  createProductFromSupplierItem,
  discardSupplierPriceList,
  findSupplierPriceListAiCost,
  findSupplierPriceListFile,
  findSupplierPriceListReview,
  linkSupplierPriceListRow,
  listSupplierItemLinkChoices,
  listSupplierPriceLists,
  loadSupplierPriceListWebPage,
  markSupplierPriceListRowReviewed,
  proposeSupplierItemLink,
  refreshSupplierPriceListWebPage,
  removeSupplierPriceListRow,
  setSupplierPriceListRowPrice,
  uploadSupplierPriceList,
} from "@purosur/domain/purchasing/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyError, FastifyInstance, FastifyReply } from "fastify";
import { DrizzleCatalogListReader } from "../catalog/drizzle-catalog-list-reader.js";
import { DrizzleInternalBarcodeStore } from "../catalog/drizzle-internal-barcode-store.js";
import { allocateInternalBarcodeHandler } from "../catalog/internal-barcode-route.js";
import {
  BRAND_INACTIVE_RESPONSE,
  BRAND_NOT_FOUND_FAILURE,
  CATEGORY_NOT_FOUND_FAILURE,
  CATEGORY_NOT_LEAF_RESPONSE,
  TAG_INACTIVE_RESPONSE,
  TAG_NOT_FOUND_FAILURE,
} from "../catalog/product-creation-route.js";
import { readRecordIds } from "../platform/record-id-params.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { backofficeOriginGuard, sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleSupplierItemLinkProposalReader } from "./drizzle-supplier-item-link-proposal-reader.js";
import { DrizzleSupplierItemProductStore } from "./drizzle-supplier-item-product-store.js";
import { DrizzleSupplierPriceListAiCallStore } from "./drizzle-supplier-price-list-ai-call-store.js";
import { DrizzleSupplierPriceListAiCostReader } from "./drizzle-supplier-price-list-ai-cost-reader.js";
import { DrizzleSupplierPriceListReader } from "./drizzle-supplier-price-list-reader.js";
import { DrizzleSupplierPriceListStore } from "./drizzle-supplier-price-list-store.js";
import { opensAsPdf } from "./opens-as-pdf.js";
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

const NOT_A_WEB_PAGE = {
  code: "not_a_web_page",
  message: "this supplier price list was not read from a web page",
} as const;

const ALREADY_READING = {
  code: "already_reading",
  message: "this supplier price list is already being read",
} as const;
const REREADING = {
  code: "rereading",
  message: "this supplier price list is being read again",
} as const;

const CONFIRMATION_REFUSALS = {
  no_rows: "the list has no rows to confirm",
  unpriced_rows: "some rows have no price",
  list_date_missing: "the list has no date",
  vat_missing: "the list does not say whether its prices include VAT",
} as const;

const LINK_REFUSALS = {
  product_not_linkable: "the product cannot be linked: it does not exist or is deactivated",
  sale_unit_changed: "the product is no longer sold in the sale unit the quantity is stated in",
  vat_rate_missing: "the list does not include VAT in its prices, so the item needs a VAT rate",
  vat_rate_invalid: "the VAT rate is not one of those offered",
} as const;

const unavailableProductChooser: ProductChooser = {
  choose: async () => ({ kind: "unavailable" }),
};

function exactFraction(fraction: { numerator: bigint; denominator: bigint }) {
  return {
    numerator: fraction.numerator.toString(),
    denominator: fraction.denominator.toString(),
  };
}

function contentDisposition(fileName: string): string {
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename*=UTF-8''${encoded}`;
}

type WebPageAdmissionRefusal =
  | { kind: "supplier_not_found" }
  | { kind: "supplier_inactive" }
  | { kind: "daily_cap_reached"; cap: number };

async function refuseAdmission(
  reply: FastifyReply,
  outcome: WebPageAdmissionRefusal,
): Promise<void> {
  switch (outcome.kind) {
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
  }
}

async function answerWebPageLoad(
  reply: FastifyReply,
  outcome: LoadSupplierPriceListWebPageOutcome,
): Promise<void> {
  switch (outcome.kind) {
    case "page_refused":
      await reply.code(422).send(
        supplierPriceListPageRefusedSchema.parse({
          code: "page_refused",
          message: "the page could not be read",
          reason: outcome.reason,
        }),
      );
      return;
    case "loaded":
      await reply.code(201).send(supplierPriceListUploadedSchema.parse({ listId: outcome.listId }));
      return;
    default:
      await refuseAdmission(reply, outcome);
  }
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

async function answerRowLink(
  reply: FastifyReply,
  outcome: LinkSupplierPriceListRowOutcome,
): Promise<void> {
  if (outcome.kind === "linked") {
    await reply.code(200).send();
    return;
  }
  if (outcome.kind === "invalid_quantity") {
    await reply.code(400).send(PART_OF_A_UNIT_RESPONSE);
    return;
  }
  if (
    outcome.kind === "product_not_linkable" ||
    outcome.kind === "sale_unit_changed" ||
    outcome.kind === "vat_rate_missing" ||
    outcome.kind === "vat_rate_invalid"
  ) {
    await reply.code(409).send({ code: outcome.kind, message: LINK_REFUSALS[outcome.kind] });
    return;
  }
  await refuseChange(reply, outcome);
}

const ALREADY_LINKED = {
  code: "already_linked",
  message: "this item already has a product, so none can be created from it",
} as const;

const PART_OF_A_UNIT_RESPONSE = {
  code: "validation_failed",
  message: "a product sold by the unit is bought in whole units",
  details: [{ field: "quantity" }],
} as const;

async function answerProductCreation(
  reply: FastifyReply,
  outcome: CreateProductFromSupplierItemOutcome,
): Promise<void> {
  switch (outcome.kind) {
    case "created":
      await reply
        .code(201)
        .send(supplierPriceListRowProductCreatedSchema.parse({ productId: outcome.productId }));
      return;
    case "already_linked":
      await reply.code(409).send(ALREADY_LINKED);
      return;
    case "invalid_quantity":
      await reply.code(400).send(PART_OF_A_UNIT_RESPONSE);
      return;
    case "vat_rate_missing":
    case "vat_rate_invalid":
      await reply.code(409).send({ code: outcome.kind, message: LINK_REFUSALS[outcome.kind] });
      return;
    case "category_not_found":
      await reply.code(400).send({
        code: "validation_failed",
        message: CATEGORY_NOT_FOUND_FAILURE.message,
        details: [{ field: CATEGORY_NOT_FOUND_FAILURE.field }],
      });
      return;
    case "category_not_leaf":
      await reply.code(409).send(CATEGORY_NOT_LEAF_RESPONSE);
      return;
    case "brand_not_found":
      await reply.code(400).send({
        code: "validation_failed",
        message: BRAND_NOT_FOUND_FAILURE.message,
        details: [{ field: BRAND_NOT_FOUND_FAILURE.field }],
      });
      return;
    case "brand_inactive":
      await reply.code(409).send(BRAND_INACTIVE_RESPONSE);
      return;
    case "tag_not_found":
      await reply.code(400).send({
        code: "validation_failed",
        message: TAG_NOT_FOUND_FAILURE.message,
        details: [{ field: TAG_NOT_FOUND_FAILURE.field }],
      });
      return;
    case "tag_inactive":
      await reply.code(409).send({ ...TAG_INACTIVE_RESPONSE, tagId: outcome.tagId });
      return;
    case "barcode_taken":
      await reply.code(409).send({ code: "barcode_taken", codes: outcome.codes });
      return;
    default:
      await refuseChange(reply, outcome);
  }
}

export function registerSupplierPriceListsRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: PurchasingRouteOptions<TQueryResult>,
): void {
  const {
    now,
    supplierPriceListFiles: files,
    supplierPriceListWebPages: webPages,
    productChooser = unavailableProductChooser,
  } = options;
  registerRouteAccess(app);
  const store = new DrizzleSupplierPriceListStore(options.db, now);
  const productStore = new DrizzleSupplierItemProductStore(options.db, now);
  const reader = new DrizzleSupplierPriceListReader(options.db);
  const proposalReader = new DrizzleSupplierItemLinkProposalReader(options.db);
  const aiCalls = new DrizzleSupplierPriceListAiCallStore(options.db);
  const aiCostReader = new DrizzleSupplierPriceListAiCostReader(options.db);
  const catalog = new DrizzleCatalogListReader(options.db);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const config = { access: capabilityAccess("supplier_price_lists"), sessionSource };
  const readGuard = { preHandler: sameOriginGuard(options.backofficeOrigin), config };
  const aiCostGuard = {
    preHandler: sameOriginGuard(options.backofficeOrigin),
    config: { access: capabilityAccess("branch_area"), sessionSource },
  };
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
        if (!(await opensAsPdf(pdf))) {
          await reply.code(415).send(NOT_A_PDF);
          return;
        }
        if (!files) {
          await reply.code(503).send(READING_UNAVAILABLE);
          return;
        }

        const openSession = openSessionOf(request);
        const outcome = await uploadSupplierPriceList(
          { zoneRules: options.zoneRules, store, files },
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
          case "supplier_inactive":
          case "daily_cap_reached":
            await refuseAdmission(reply, outcome);
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

  app.get("/supplier-price-lists/link-choices", readGuard, async (_request, reply) => {
    const products = await catalog.products(PRODUCTS_PACKAGINGS_MAY_BE_DEFINED_FOR);
    const choices = listSupplierItemLinkChoices(products, await listBrands({ catalog }));
    await reply.code(200).send(supplierItemLinkChoicesSchema.parse(choices));
  });

  app.get("/supplier-price-lists/product-categories", readGuard, async (_request, reply) => {
    const rows = await catalog.categories();
    await reply.code(200).send(categoryListSchema.parse(rows));
  });

  app.get("/supplier-price-lists/product-brands", readGuard, async (_request, reply) => {
    const rows = await listBrands({ catalog });
    await reply.code(200).send(brandListSchema.parse(rows));
  });

  app.get("/supplier-price-lists/product-tags", readGuard, async (_request, reply) => {
    await reply.code(200).send(tagListSchema.parse(await listTags({ catalog })));
  });

  app.post(
    "/supplier-price-lists/internal-barcodes",
    writeGuard,
    allocateInternalBarcodeHandler(new DrizzleInternalBarcodeStore(options.db)),
  );

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
        rows: found.rows.map((row) => ({
          ...row,
          pricePerSaleUnit: row.pricePerSaleUnit && exactFraction(row.pricePerSaleUnit),
        })),
        counts: found.counts,
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

  app.get("/supplier-price-lists/:id/ai-cost", aiCostGuard, async (request, reply) => {
    const ids = await readRecordIds(reply, request.params, ["id"]);
    if (!ids) {
      return;
    }
    const outcome = await findSupplierPriceListAiCost({ reader: aiCostReader }, { listId: ids.id });
    if (outcome.kind === "not_found") {
      await reply.code(404).send(NOT_FOUND);
      return;
    }
    await reply.code(200).send(
      supplierPriceListAiCostSchema.parse({
        ...outcome.cost,
        recordedFromStart: outcome.recordedFromStart,
      }),
    );
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

  app.put("/supplier-price-lists/:id/rows/:rowId/link", writeGuard, async (request, reply) => {
    const ids = await readRecordIds(reply, request.params, ["id", "rowId"]);
    if (!ids) {
      return;
    }
    const body = await readValidatedBody(reply, supplierPriceListRowLinkBodySchema, request.body);
    if (!body) {
      return;
    }
    const outcome = await linkSupplierPriceListRow(store, {
      listId: ids.id,
      rowId: ids.rowId,
      version: body.version,
      productId: body.productId,
      saleUnit: body.saleUnit,
      quantity: body.quantity,
      vatRate: body.vatRate,
      actorId: openSessionOf(request).userId,
    });
    await answerRowLink(reply, outcome);
  });

  app.post("/supplier-price-lists/:id/rows/:rowId/product", writeGuard, async (request, reply) => {
    const ids = await readRecordIds(reply, request.params, ["id", "rowId"]);
    if (!ids) {
      return;
    }
    const body = await readValidatedBody(
      reply,
      supplierPriceListRowProductCreationBodySchema,
      request.body,
    );
    if (!body) {
      return;
    }
    const outcome = await createProductFromSupplierItem(productStore, {
      ...body,
      listId: ids.id,
      rowId: ids.rowId,
      actorId: openSessionOf(request).userId,
    });
    await answerProductCreation(reply, outcome);
  });

  app.put("/supplier-price-lists/:id/rows/:rowId/review", writeGuard, async (request, reply) => {
    const ids = await readRecordIds(reply, request.params, ["id", "rowId"]);
    if (!ids) {
      return;
    }
    const body = await readValidatedBody(reply, supplierPriceListRowReviewBodySchema, request.body);
    if (!body) {
      return;
    }
    const outcome = await markSupplierPriceListRowReviewed(store, {
      listId: ids.id,
      rowId: ids.rowId,
      version: body.version,
      actorId: openSessionOf(request).userId,
    });
    if (outcome.kind !== "reviewed") {
      await refuseChange(reply, outcome);
      return;
    }
    await reply.code(200).send();
  });

  app.get(
    "/supplier-price-lists/:id/rows/:rowId/link-proposal",
    readGuard,
    async (request, reply) => {
      const ids = await readRecordIds(reply, request.params, ["id", "rowId"]);
      if (!ids) {
        return;
      }
      const outcome = await proposeSupplierItemLink(
        { reader: proposalReader, chooser: productChooser, aiCalls, zoneRules: options.zoneRules },
        { listId: ids.id, rowId: ids.rowId, actorId: openSessionOf(request).userId, now },
      );
      if (outcome.kind === "not_found") {
        await reply.code(404).send(NOT_FOUND);
        return;
      }
      await reply.code(200).send(supplierItemLinkProposalSchema.parse(outcome));
    },
  );

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
      pricesIncludeVat: body.pricesIncludeVat,
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
      outcome.kind === "list_date_missing" ||
      outcome.kind === "vat_missing"
    ) {
      await reply
        .code(409)
        .send({ code: outcome.kind, message: CONFIRMATION_REFUSALS[outcome.kind] });
      return;
    }
    if (outcome.kind === "rereading") {
      await reply.code(409).send(REREADING);
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

  app.post("/supplier-price-lists/web-page", writeGuard, async (request, reply) => {
    const body = await readValidatedBody(reply, supplierPriceListWebPageBodySchema, request.body);
    if (!body) {
      return;
    }
    if (!files || !webPages) {
      await reply.code(503).send(READING_UNAVAILABLE);
      return;
    }

    const openSession = openSessionOf(request);
    const outcome = await loadSupplierPriceListWebPage(
      { zoneRules: options.zoneRules, store, files, webPages },
      {
        supplierId: body.supplierId,
        locationId: openSession.locationId,
        url: body.url,
        actorId: openSession.userId,
        now: now(),
      },
    );
    await answerWebPageLoad(reply, outcome);
  });

  app.post("/supplier-price-lists/:id/refresh", writeGuard, async (request, reply) => {
    const ids = await readRecordIds(reply, request.params, ["id"]);
    if (!ids) {
      return;
    }
    if (!files || !webPages) {
      await reply.code(503).send(READING_UNAVAILABLE);
      return;
    }

    const openSession = openSessionOf(request);
    const outcome = await refreshSupplierPriceListWebPage(
      { zoneRules: options.zoneRules, store, files, webPages },
      {
        listId: ids.id,
        locationId: openSession.locationId,
        actorId: openSession.userId,
        now: now(),
      },
    );
    switch (outcome.kind) {
      case "not_found":
        await reply.code(404).send(NOT_FOUND);
        return;
      case "not_a_web_page":
        await reply.code(409).send(NOT_A_WEB_PAGE);
        return;
      case "already_reading":
        await reply.code(409).send(ALREADY_READING);
        return;
      case "reread_started":
        await reply
          .code(202)
          .send(supplierPriceListRereadStartedSchema.parse({ listId: outcome.listId }));
        return;
      default:
        await answerWebPageLoad(reply, outcome);
    }
  });
}
