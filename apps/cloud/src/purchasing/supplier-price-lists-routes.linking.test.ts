import type {
  AiCallUsage,
  ProductChoice,
  SupplierItemQuantityReading,
} from "@purosur/domain/purchasing/use-cases";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertBrand } from "../catalog/test-support/catalog-route-fixtures.js";
import {
  auditLog,
  supplierPriceListAiCalls,
  supplierPriceListRows,
} from "../platform/db/schema.js";
import { BACKOFFICE_ORIGIN, signedInWith } from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { registerSupplierPriceListsRoutes } from "./supplier-price-lists-routes.js";
import {
  extractedListWithRow as sharedExtractedListWithRow,
  storedListRow,
  storedListVersion,
} from "./test-support/extracted-list-fixtures.js";
import { insertBarcode, insertProduct } from "./test-support/purchasing-fixtures.js";
import { insertPriceListRows } from "./test-support/supplier-price-list-fixtures.js";

const NOW = new Date("2026-09-16T15:00:00.000Z");
const MISSING_ID = "00000000-0000-4000-8000-000000000000";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  app = Fastify();
  registerSupplierPriceListsRoutes(app, {
    zoneRules: fixedZoneRulesSource(),
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => NOW,
  });
});

afterEach(async () => {
  await app.close();
});

async function appChoosing(choice: ProductChoice): Promise<void> {
  await app.close();
  app = Fastify();
  registerSupplierPriceListsRoutes(app, {
    zoneRules: fixedZoneRulesSource(),
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => NOW,
    productChooser: { choose: async () => choice },
  });
}

async function appReadingQuantity(
  reading: SupplierItemQuantityReading | Error,
  asked: { item: unknown; product: unknown }[] = [],
  reportedCalls: AiCallUsage[] = [],
): Promise<void> {
  await app.close();
  app = Fastify();
  registerSupplierPriceListsRoutes(app, {
    zoneRules: fixedZoneRulesSource(),
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => NOW,
    supplierItemQuantityReader: {
      read: async (item, product, onCall) => {
        asked.push({ item, product });
        for (const usage of reportedCalls) {
          onCall(usage);
        }
        if (reading instanceof Error) {
          throw reading;
        }
        return reading;
      },
    },
  });
}

const manager = () => signedInWith(db, ["manage_supplier_price_lists"], NOW);

const extractedListWithRow = (
  list?: Parameters<typeof sharedExtractedListWithRow>[1],
  row?: Parameters<typeof sharedExtractedListWithRow>[2],
) => sharedExtractedListWithRow(db, list, row);

async function productToLink(
  name = "Yerba 1 kg",
  description: { brandName?: string; netContent?: { quantity: number; unit: "G" | "KG" } } = {},
) {
  const { id: productId } = await insertProduct(db, { name, ...description });
  return { productId, saleUnit: "UNIT", quantity: 10_000 };
}

const storedRow = (rowId: string) => storedListRow(db, rowId);
const storedVersion = (listId: string) => storedListVersion(db, listId);

describe("authorization of the linking routes", () => {
  const routes = [
    ["PUT", `/supplier-price-lists/${MISSING_ID}/rows/${MISSING_ID}/link`],
    ["PUT", `/supplier-price-lists/${MISSING_ID}/rows/${MISSING_ID}/review`],
    ["GET", `/supplier-price-lists/${MISSING_ID}/rows/${MISSING_ID}/link-proposal`],
    ["POST", `/supplier-price-lists/${MISSING_ID}/rows/${MISSING_ID}/quantity-proposal`],
    ["GET", "/supplier-price-lists/link-choices"],
  ] as const;

  it.each(routes)("%s %s answers 401 when no session cookie was sent", async (method, url) => {
    const response = await app.inject({ method, url, headers: { origin: BACKOFFICE_ORIGIN } });

    expect(response.statusCode).toBe(401);
  });

  it.each(routes)("%s %s answers 403 to a user without the permission", async (method, url) => {
    const { headers } = await signedInWith(db, ["record_purchases"], NOW);

    const response = await app.inject({ method, url, headers });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });
});

describe("PUT /supplier-price-lists/:id/rows/:rowId/link", () => {
  function link(headers: Record<string, string>, listId: string, rowId: string, payload: object) {
    return app.inject({
      method: "PUT",
      url: `/supplier-price-lists/${listId}/rows/${rowId}/link`,
      headers,
      payload,
    });
  }

  it("rejects an Origin that is not the backoffice's own, changing nothing", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow();
    const target = await productToLink();

    const response = await link({ ...headers, origin: "https://attacker.example" }, listId, rowId, {
      ...target,
      version: 1,
      vatRate: 2_100,
    });

    expect(response.statusCode).toBe(403);
    expect((await storedRow(rowId))?.productId).toBeNull();
  });

  it.each([
    ["a VAT rate that is not offered", { vatRate: 500 }],
    ["a product that is not an id", { productId: "not-an-id" }],
    ["no version", { version: undefined }],
    ["no sale unit", { saleUnit: undefined }],
  ])("answers 400 for %s", async (_name, overrides) => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow();
    const target = await productToLink();

    const response = await link(headers, listId, rowId, {
      ...target,
      version: 1,
      vatRate: 2_100,
      ...overrides,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });

  it("links the row to the product with the quantity and the VAT rate, marking it reviewed, and answers 200", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow();
    const target = await productToLink();

    const response = await link(headers, listId, rowId, { ...target, version: 1, vatRate: 1_050 });

    expect(response.statusCode).toBe(200);
    expect(await storedRow(rowId)).toMatchObject({ ...target, vatRate: 1_050, reviewed: true });
    expect(await storedVersion(listId)).toBe(2);
    const audits = await db.select().from(auditLog).where(eq(auditLog.entityId, rowId));
    expect(audits).toHaveLength(1);
  });

  it("links a row of a list whose prices include VAT without a rate", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow({ pricesIncludeVat: true });
    const target = await productToLink();

    const response = await link(headers, listId, rowId, { ...target, version: 1 });

    expect(response.statusCode).toBe(200);
    expect(await storedRow(rowId)).toMatchObject({ ...target, vatRate: null });
  });

  it("answers 404 for a list or a row that does not exist", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow();
    const target = await productToLink();
    const body = { ...target, version: 1, vatRate: 2_100 };

    const noList = await link(headers, MISSING_ID, rowId, body);
    const noRow = await link(headers, listId, MISSING_ID, body);

    expect(noList.statusCode).toBe(404);
    expect(noList.json()).toMatchObject({ code: "not_found" });
    expect(noRow.statusCode).toBe(404);
  });

  it("answers 409 stale_version for a list changed since it was loaded, changing nothing", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow({ version: 3 });
    const target = await productToLink();

    const response = await link(headers, listId, rowId, { ...target, version: 2, vatRate: 2_100 });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "stale_version" });
    expect((await storedRow(rowId))?.productId).toBeNull();
  });

  it("answers 409 not_editable for a list that was discarded", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow({ state: "DISCARDED" });
    const target = await productToLink();

    const response = await link(headers, listId, rowId, { ...target, version: 1, vatRate: 2_100 });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "not_editable" });
  });

  it("answers 409 product_not_linkable for a product that is deactivated or that does not exist", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow();
    const inactive = await insertProduct(db, { name: "Descontinuado", active: false });

    for (const productId of [inactive.id, MISSING_ID]) {
      const response = await link(headers, listId, rowId, {
        productId,
        saleUnit: "UNIT",
        quantity: 10_000,
        version: 1,
        vatRate: 2_100,
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: "product_not_linkable" });
    }
    expect((await storedRow(rowId))?.productId).toBeNull();
  });

  it("answers 409 sale_unit_changed for a quantity stated in a sale unit the product is no longer sold by, linking nothing", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow();
    const target = await productToLink();

    const response = await link(headers, listId, rowId, {
      ...target,
      saleUnit: "KG",
      version: 1,
      vatRate: 2_100,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "sale_unit_changed" });
    expect((await storedRow(rowId))?.productId).toBeNull();
  });

  it("answers 400 for a quantity that is part of a unit for a product sold by the unit, linking nothing", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow();
    const target = await productToLink();

    const response = await link(headers, listId, rowId, {
      ...target,
      quantity: 1_500,
      version: 1,
      vatRate: 2_100,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "quantity" }],
    });
    expect((await storedRow(rowId))?.productId).toBeNull();
  });

  it("answers 409 vat_rate_missing for a list whose prices exclude VAT when no rate was given", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow({ pricesIncludeVat: false });
    const target = await productToLink();

    const response = await link(headers, listId, rowId, { ...target, version: 1 });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "vat_rate_missing" });
    expect((await storedRow(rowId))?.productId).toBeNull();
  });
});

describe("PUT /supplier-price-lists/:id/rows/:rowId/review", () => {
  function review(headers: Record<string, string>, listId: string, rowId: string, payload: object) {
    return app.inject({
      method: "PUT",
      url: `/supplier-price-lists/${listId}/rows/${rowId}/review`,
      headers,
      payload,
    });
  }

  it("rejects an Origin that is not the backoffice's own, changing nothing", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow();

    const response = await review(
      { ...headers, origin: "https://attacker.example" },
      listId,
      rowId,
      {
        version: 1,
      },
    );

    expect(response.statusCode).toBe(403);
    expect((await storedRow(rowId))?.reviewed).toBe(false);
  });

  it("answers 400 for a body the contract refuses", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow();

    const response = await review(headers, listId, rowId, {});

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });

  it("marks the row reviewed, advances the version and answers 200", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow();

    const response = await review(headers, listId, rowId, { version: 1 });

    expect(response.statusCode).toBe(200);
    expect((await storedRow(rowId))?.reviewed).toBe(true);
    expect(await storedVersion(listId)).toBe(2);
  });

  it("answers 404 for a list or a row that does not exist", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow();

    expect((await review(headers, MISSING_ID, rowId, { version: 1 })).statusCode).toBe(404);
    expect((await review(headers, listId, MISSING_ID, { version: 1 })).statusCode).toBe(404);
  });

  it("answers 409 stale_version for a list changed since it was loaded", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow({ version: 2 });

    const response = await review(headers, listId, rowId, { version: 1 });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "stale_version" });
  });

  it("answers 409 not_editable for a list already confirmed", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow({ state: "REVIEWED" });

    const response = await review(headers, listId, rowId, { version: 1 });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "not_editable" });
  });
});

describe("GET /supplier-price-lists/:id/rows/:rowId/link-proposal", () => {
  const proposal = (headers: Record<string, string>, listId: string, rowId: string) =>
    app.inject({
      method: "GET",
      url: `/supplier-price-lists/${listId}/rows/${rowId}/link-proposal`,
      headers,
    });

  it("proposes the product whose barcode the row carries", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow({}, { barcode: "7790000000011" });
    const { id: productId } = await insertProduct(db, { name: "Yerba 1 kg" });
    await insertBarcode(db, { productId, code: "7790000000011" });

    const response = await proposal(headers, listId, rowId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      kind: "proposed",
      by: "barcode",
      quantity: null,
      product: { id: productId, name: "Yerba 1 kg", brandName: null, netContent: null },
    });
  });

  it("proposes the product the model chose among the candidates of a row without a barcode", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow({}, { description: "Yerba suave 1 kg" });
    const { id: productId } = await insertProduct(db, { name: "Yerba Suave 1 kg" });
    await appChoosing({ kind: "chosen", productId, quantity: null });

    const response = await proposal(headers, listId, rowId);

    expect(response.json()).toEqual({
      kind: "proposed",
      by: "ai",
      quantity: null,
      product: { id: productId, name: "Yerba Suave 1 kg", brandName: null, netContent: null },
    });
  });

  it("proposes the product of the item's brand among same-name products", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow(
      {},
      { description: "Granola berries 1kg - Kos" },
    );
    const kos = await insertBrand(db, { name: "Kos" });
    const other = await insertBrand(db, { name: "Otra" });
    await insertProduct(db, {
      name: "Granola Berries",
      brandId: other.id,
      netContent: { quantity: 500, unit: "G" },
    });
    const { id: productId } = await insertProduct(db, {
      name: "Granola Berries",
      brandId: kos.id,
      netContent: { quantity: 1, unit: "KG" },
    });
    await appChoosing({ kind: "chosen", productId, quantity: null });

    const response = await proposal(headers, listId, rowId);

    expect(response.json()).toEqual({
      kind: "proposed",
      by: "ai",
      quantity: null,
      product: {
        id: productId,
        name: "Granola Berries",
        brandName: "Kos",
        netContent: { quantity: 1, unit: "KG" },
      },
    });
  });

  it("answers none when the model chose no product", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow({}, { description: "Yerba suave 1 kg" });
    await insertProduct(db, { name: "Yerba Suave 1 kg" });
    await appChoosing({ kind: "none" });

    const response = await proposal(headers, listId, rowId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ kind: "none" });
  });

  it("answers unavailable when the model could not choose", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow({}, { description: "Yerba suave 1 kg" });
    await insertProduct(db, { name: "Yerba Suave 1 kg" });
    await appChoosing({ kind: "unavailable" });

    const response = await proposal(headers, listId, rowId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ kind: "unavailable" });
  });

  it("answers unavailable when no model is configured", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow({}, { description: "Yerba suave 1 kg" });
    await insertProduct(db, { name: "Yerba Suave 1 kg" });

    const response = await proposal(headers, listId, rowId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ kind: "unavailable" });
  });

  it("records the call of the model for the person who asked and for the list", async () => {
    const { headers, userId } = await manager();
    const { listId, rowId, supplierId } = await extractedListWithRow(
      {},
      { description: "Yerba suave 1 kg" },
    );
    await insertProduct(db, { name: "Yerba Suave 1 kg" });
    await app.close();
    app = Fastify();
    registerSupplierPriceListsRoutes(app, {
      zoneRules: fixedZoneRulesSource(),
      db,
      backofficeOrigin: BACKOFFICE_ORIGIN,
      now: () => NOW,
      productChooser: {
        choose: async (_item, _candidates, onCall) => {
          onCall({
            outcome: "completed",
            attempts: [
              {
                model: "claude-sonnet-5-5",
                inputTokens: 1_000,
                outputTokens: 100,
                cacheWriteTokens: 0,
                cacheReadTokens: 0,
              },
            ],
          });
          return { kind: "none" };
        },
      },
    });

    await proposal(headers, listId, rowId);

    expect(await db.select().from(supplierPriceListAiCalls)).toEqual([
      expect.objectContaining({
        purpose: "LINK_PROPOSAL",
        listId,
        rowId,
        supplierId,
        actorId: userId,
        occurredAt: NOW,
        occurredOn: "2026-09-16",
        outcome: "completed",
        costNanoUsd: 3_000_000,
      }),
    ]);
  });

  it("answers 404 for a list or a row that does not exist", async () => {
    const { headers } = await manager();
    const { listId } = await extractedListWithRow();

    const noRow = await proposal(headers, listId, MISSING_ID);
    const noList = await proposal(headers, MISSING_ID, MISSING_ID);

    expect(noRow.statusCode).toBe(404);
    expect(noRow.json()).toMatchObject({ code: "not_found" });
    expect(noList.statusCode).toBe(404);
  });

  it("answers 400 for an id that is not a record id", async () => {
    const { headers } = await manager();

    const response = await proposal(headers, "not-an-id", MISSING_ID);

    expect(response.statusCode).toBe(400);
  });
});

describe("link proposals with a quantity", () => {
  const proposal = (headers: Record<string, string>, listId: string, rowId: string) =>
    app.inject({
      method: "GET",
      url: `/supplier-price-lists/${listId}/rows/${rowId}/link-proposal`,
      headers,
    });

  it("proposes the quantity the model chose with the product, from the other presentations of the list", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow(
      {},
      { description: "Aceite de palta 250 ml", presentation: "x3 packs" },
    );
    await insertPriceListRows(
      db,
      listId,
      [{ description: "Aceite de palta 250 ml", presentation: "Pack x12u" }],
      1,
    );
    const { id: productId } = await insertProduct(db, { name: "Aceite de palta 250 ml" });
    const asked: unknown[] = [];
    await app.close();
    app = Fastify();
    registerSupplierPriceListsRoutes(app, {
      zoneRules: fixedZoneRulesSource(),
      db,
      backofficeOrigin: BACKOFFICE_ORIGIN,
      now: () => NOW,
      productChooser: {
        choose: async (item) => {
          asked.push(item);
          return { kind: "chosen", productId, quantity: 36_000 };
        },
      },
    });

    const response = await proposal(headers, listId, rowId);

    expect(response.json()).toEqual({
      kind: "proposed",
      by: "ai",
      quantity: 36_000,
      product: { id: productId, name: "Aceite de palta 250 ml", brandName: null, netContent: null },
    });
    expect(asked).toEqual([
      {
        description: "Aceite de palta 250 ml",
        presentation: "x3 packs",
        otherPresentations: ["Pack x12u"],
      },
    ]);
  });

  it("proposes the quantity of a product proposed by barcode from the quantity reader", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow(
      {},
      { barcode: "7790000000011", presentation: "Bolsa 2,5 kg" },
    );
    const { id: productId } = await insertProduct(db, { name: "Almendras", saleUnit: "KG" });
    await insertBarcode(db, { productId, code: "7790000000011" });
    const asked: { item: unknown; product: unknown }[] = [];
    await appReadingQuantity({ kind: "read", quantity: 12_500 }, asked);

    const response = await proposal(headers, listId, rowId);

    expect(response.json()).toEqual({
      kind: "proposed",
      by: "barcode",
      quantity: 12_500,
      product: { id: productId, name: "Almendras", brandName: null, netContent: null },
    });
    expect(asked).toEqual([
      {
        item: expect.objectContaining({ presentation: "Bolsa 2,5 kg", otherPresentations: [] }),
        product: { saleUnit: "KG", netContent: null },
      },
    ]);
  });

  it("proposes the product of a barcode with no quantity when no reader is configured", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow({}, { barcode: "7790000000011" });
    const { id: productId } = await insertProduct(db, { name: "Yerba 1 kg" });
    await insertBarcode(db, { productId, code: "7790000000011" });

    const response = await proposal(headers, listId, rowId);

    expect(response.json()).toMatchObject({ kind: "proposed", by: "barcode", quantity: null });
  });
});

describe("POST /supplier-price-lists/:id/rows/:rowId/quantity-proposal", () => {
  const proposeQuantity = (
    headers: Record<string, string>,
    listId: string,
    rowId: string,
    payload: object = { saleUnit: "UNIT", netContent: null },
  ) =>
    app.inject({
      method: "POST",
      url: `/supplier-price-lists/${listId}/rows/${rowId}/quantity-proposal`,
      headers,
      payload,
    });

  it("proposes the quantity the reader read for the row, given the sale unit and net content", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow(
      {},
      { description: "Aceite de palta 250 ml", presentation: "x3 packs" },
    );
    await insertPriceListRows(
      db,
      listId,
      [{ description: "Aceite de palta 250 ml", presentation: "Pack x12u" }],
      1,
    );
    const asked: { item: unknown; product: unknown }[] = [];
    await appReadingQuantity({ kind: "read", quantity: 36_000 }, asked);

    const response = await proposeQuantity(headers, listId, rowId, {
      saleUnit: "UNIT",
      netContent: { quantity: 250, unit: "ML" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ kind: "proposed", quantity: 36_000 });
    expect(asked).toEqual([
      {
        item: {
          description: "Aceite de palta 250 ml",
          presentation: "x3 packs",
          otherPresentations: ["Pack x12u"],
        },
        product: { saleUnit: "UNIT", netContent: { quantity: 250, unit: "ML" } },
      },
    ]);
  });

  it.each([
    ["none", { kind: "none" as const }, { kind: "none" }],
    ["unavailable", { kind: "unavailable" as const }, { kind: "unavailable" }],
    [
      "a quantity the sale unit refuses",
      { kind: "read" as const, quantity: 1_500 },
      { kind: "none" },
    ],
    ["a failure", new Error("network down"), { kind: "unavailable" }],
  ])("answers %s of the reader", async (_name, reading, answer) => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow();
    await appReadingQuantity(reading);

    const response = await proposeQuantity(headers, listId, rowId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(answer);
  });

  it("answers unavailable when no reader is configured", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow();

    const response = await proposeQuantity(headers, listId, rowId);

    expect(response.json()).toEqual({ kind: "unavailable" });
  });

  it("records the call of the reader for the person who asked and for the list", async () => {
    const { headers, userId } = await manager();
    const { listId, rowId, supplierId } = await extractedListWithRow();
    await appReadingQuantity(
      { kind: "none" },
      [],
      [
        {
          outcome: "completed",
          attempts: [
            {
              model: "claude-sonnet-5-5",
              inputTokens: 1_000,
              outputTokens: 100,
              cacheWriteTokens: 0,
              cacheReadTokens: 0,
            },
          ],
        },
      ],
    );

    await proposeQuantity(headers, listId, rowId);

    expect(await db.select().from(supplierPriceListAiCalls)).toEqual([
      expect.objectContaining({
        purpose: "LINK_PROPOSAL",
        listId,
        rowId,
        supplierId,
        actorId: userId,
        occurredAt: NOW,
        outcome: "completed",
        costNanoUsd: 3_000_000,
      }),
    ]);
  });

  it("answers 404 for a list or a row that does not exist", async () => {
    const { headers } = await manager();
    const { listId } = await extractedListWithRow();

    const noRow = await proposeQuantity(headers, listId, MISSING_ID);
    const noList = await proposeQuantity(headers, MISSING_ID, MISSING_ID);

    expect(noRow.statusCode).toBe(404);
    expect(noRow.json()).toMatchObject({ code: "not_found" });
    expect(noList.statusCode).toBe(404);
  });

  it("answers 400 for an id that is not a record id", async () => {
    const { headers } = await manager();

    const response = await proposeQuantity(headers, "not-an-id", MISSING_ID);

    expect(response.statusCode).toBe(400);
  });

  it.each([
    {},
    { saleUnit: "KILO" },
    { saleUnit: "UNIT", netContent: { quantity: -1, unit: "G" } },
  ])("answers 400 for the body %j, without reading", async (payload) => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow();
    const asked: { item: unknown; product: unknown }[] = [];
    await appReadingQuantity({ kind: "none" }, asked);

    const response = await proposeQuantity(headers, listId, rowId, payload);

    expect(response.statusCode).toBe(400);
    expect(asked).toEqual([]);
  });
});

describe("GET /supplier-price-lists/:id with linked rows", () => {
  it("answers each row with its barcode, link, status and exact price per sale unit, and the counts", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow(
      { pricesIncludeVat: true },
      { priceCents: 1_000, barcode: "7790000000011" },
    );
    const { productId, quantity } = await productToLink("Yerba", {
      brandName: "Piragüé",
      netContent: { quantity: 1, unit: "KG" },
    });
    await db
      .update(supplierPriceListRows)
      .set({ productId, quantity, saleUnit: "UNIT" })
      .where(eq(supplierPriceListRows.id, rowId));

    const response = await app.inject({
      method: "GET",
      url: `/supplier-price-lists/${listId}`,
      headers,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      rows: [
        {
          id: rowId,
          barcode: "7790000000011",
          link: {
            product: {
              id: productId,
              name: "Yerba",
              brandName: "Piragüé",
              netContent: { quantity: 1, unit: "KG" },
              saleUnit: "UNIT",
            },
            quantity: 10_000,
            saleUnit: "UNIT",
            current: true,
            vatRate: null,
          },
          status: "new",
          needsReview: true,
          previousPriceCents: null,
          pricePerSaleUnit: { numerator: "100", denominator: "1" },
        },
      ],
      counts: { needingReview: 1, linkedAutomatically: 0 },
      actions: { linkRows: true, markRowsReviewed: true },
    });
    expect(response.json().list.requiresVatRate).toBe(false);
  });

  it("answers a row not linked without a link and without a price per sale unit", async () => {
    const { headers } = await manager();
    const { listId } = await extractedListWithRow();

    const response = await app.inject({
      method: "GET",
      url: `/supplier-price-lists/${listId}`,
      headers,
    });

    expect(response.json()).toMatchObject({
      rows: [{ barcode: null, link: null, pricePerSaleUnit: null }],
    });
  });
});

describe("GET /supplier-price-lists/link-choices", () => {
  function choices(headers: Record<string, string>) {
    return app.inject({ method: "GET", url: "/supplier-price-lists/link-choices", headers });
  }

  it("answers each active product with the unit it is sold by", async () => {
    const { headers } = await manager();
    const yerba = await insertProduct(db, { name: "Yerba 1 kg" });
    const harina = await insertProduct(db, { name: "Harina", saleUnit: "KG" });
    await insertProduct(db, { name: "Descontinuado", active: false });

    const response = await choices(headers);

    expect(response.statusCode).toBe(200);
    const { products } = response.json();
    expect(products).toHaveLength(2);
    expect(products).toEqual(
      expect.arrayContaining([
        {
          id: yerba.id,
          name: "Yerba 1 kg",
          saleUnit: "UNIT",
          brandName: null,
          netContent: null,
        },
        {
          id: harina.id,
          name: "Harina",
          saleUnit: "KG",
          brandName: null,
          netContent: null,
        },
      ]),
    );
  });

  it("names each product's brand and gives its net content", async () => {
    const { headers } = await manager();
    const kos = await insertBrand(db, { name: "Kos" });
    const granola = await insertProduct(db, {
      name: "Granola Berries",
      brandId: kos.id,
      netContent: { quantity: 1, unit: "KG" },
    });

    const response = await choices(headers);

    expect(response.json().products).toEqual([
      expect.objectContaining({
        id: granola.id,
        brandName: "Kos",
        netContent: { quantity: 1, unit: "KG" },
      }),
    ]);
  });

  it("answers the VAT rates an item may carry and the one preselected", async () => {
    const { headers } = await manager();

    const response = await choices(headers);

    expect(response.json().vatRates).toEqual({ offered: [2100, 1050], default: 2100 });
  });

  it("is read with the permission to manage supplier price lists alone", async () => {
    const { headers } = await signedInWith(db, ["manage_supplier_price_lists"], NOW);

    expect((await choices(headers)).statusCode).toBe(200);
  });
});
