import type { ProductChoice } from "@purosur/domain/purchasing/use-cases";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditLog, supplierPriceListRows } from "../platform/db/schema.js";
import { BACKOFFICE_ORIGIN, signedInWith } from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { registerSupplierPriceListsRoutes } from "./supplier-price-lists-routes.js";
import {
  extractedListWithRow as sharedExtractedListWithRow,
  storedListRow,
  storedListVersion,
} from "./test-support/extracted-list-fixtures.js";
import {
  insertActor,
  insertBarcode,
  insertPackaging,
  insertProduct,
} from "./test-support/purchasing-fixtures.js";

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

const manager = () => signedInWith(db, ["manage_supplier_price_lists"], NOW);

const extractedListWithRow = (
  list?: Parameters<typeof sharedExtractedListWithRow>[1],
  row?: Parameters<typeof sharedExtractedListWithRow>[2],
) => sharedExtractedListWithRow(db, list, row);

async function productWithPackaging(actorId: string, name = "Yerba 1 kg") {
  const { id: productId } = await insertProduct(db, { name });
  const packagingId = await insertPackaging(db, {
    productId,
    actorId,
    name: "Caja x 10",
    quantityPerPackage: 10_000,
  });
  return { productId, packagingId };
}

const storedRow = (rowId: string) => storedListRow(db, rowId);
const storedVersion = (listId: string) => storedListVersion(db, listId);

describe("authorization of the linking routes", () => {
  const routes = [
    ["PUT", `/supplier-price-lists/${MISSING_ID}/rows/${MISSING_ID}/link`],
    ["PUT", `/supplier-price-lists/${MISSING_ID}/rows/${MISSING_ID}/review`],
    ["GET", `/supplier-price-lists/${MISSING_ID}/rows/${MISSING_ID}/link-proposal`],
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
    const { listId, rowId, actorId } = await extractedListWithRow();
    const target = await productWithPackaging(actorId);

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
  ])("answers 400 for %s", async (_name, overrides) => {
    const { headers } = await manager();
    const { listId, rowId, actorId } = await extractedListWithRow();
    const target = await productWithPackaging(actorId);

    const response = await link(headers, listId, rowId, {
      ...target,
      version: 1,
      vatRate: 2_100,
      ...overrides,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });

  it("links the row to the product and packaging with the VAT rate, marking it reviewed, and answers 200", async () => {
    const { headers } = await manager();
    const { listId, rowId, actorId } = await extractedListWithRow();
    const target = await productWithPackaging(actorId);

    const response = await link(headers, listId, rowId, { ...target, version: 1, vatRate: 1_050 });

    expect(response.statusCode).toBe(200);
    expect(await storedRow(rowId)).toMatchObject({ ...target, vatRate: 1_050, reviewed: true });
    expect(await storedVersion(listId)).toBe(2);
    const audits = await db.select().from(auditLog).where(eq(auditLog.entityId, rowId));
    expect(audits).toHaveLength(1);
  });

  it("links a row of a list whose prices include VAT without a rate", async () => {
    const { headers } = await manager();
    const { listId, rowId, actorId } = await extractedListWithRow({ pricesIncludeVat: true });
    const target = await productWithPackaging(actorId);

    const response = await link(headers, listId, rowId, { ...target, version: 1 });

    expect(response.statusCode).toBe(200);
    expect(await storedRow(rowId)).toMatchObject({ ...target, vatRate: null });
  });

  it("answers 404 for a list or a row that does not exist", async () => {
    const { headers } = await manager();
    const { listId, rowId, actorId } = await extractedListWithRow();
    const target = await productWithPackaging(actorId);
    const body = { ...target, version: 1, vatRate: 2_100 };

    const noList = await link(headers, MISSING_ID, rowId, body);
    const noRow = await link(headers, listId, MISSING_ID, body);

    expect(noList.statusCode).toBe(404);
    expect(noList.json()).toMatchObject({ code: "not_found" });
    expect(noRow.statusCode).toBe(404);
  });

  it("answers 409 stale_version for a list changed since it was loaded, changing nothing", async () => {
    const { headers } = await manager();
    const { listId, rowId, actorId } = await extractedListWithRow({ version: 3 });
    const target = await productWithPackaging(actorId);

    const response = await link(headers, listId, rowId, { ...target, version: 2, vatRate: 2_100 });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "stale_version" });
    expect((await storedRow(rowId))?.productId).toBeNull();
  });

  it("answers 409 not_editable for a list that was discarded", async () => {
    const { headers } = await manager();
    const { listId, rowId, actorId } = await extractedListWithRow({ state: "DISCARDED" });
    const target = await productWithPackaging(actorId);

    const response = await link(headers, listId, rowId, { ...target, version: 1, vatRate: 2_100 });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "not_editable" });
  });

  it("answers 409 packaging_not_linkable for a packaging that is deactivated, of another product or that does not exist", async () => {
    const { headers } = await manager();
    const { listId, rowId, actorId } = await extractedListWithRow();
    const target = await productWithPackaging(actorId);
    const other = await productWithPackaging(actorId, "Azúcar 1 kg");
    const inactive = await insertPackaging(db, {
      productId: target.productId,
      actorId,
      active: false,
    });

    for (const packagingId of [inactive, other.packagingId, MISSING_ID]) {
      const response = await link(headers, listId, rowId, {
        productId: target.productId,
        packagingId,
        version: 1,
        vatRate: 2_100,
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: "packaging_not_linkable" });
    }
    expect((await storedRow(rowId))?.productId).toBeNull();
  });

  it("answers 409 vat_rate_missing for a list whose prices exclude VAT when no rate was given", async () => {
    const { headers } = await manager();
    const { listId, rowId, actorId } = await extractedListWithRow({ pricesIncludeVat: false });
    const target = await productWithPackaging(actorId);

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
      product: { id: productId, name: "Yerba 1 kg" },
    });
  });

  it("proposes the product the model chose among the candidates of a row without a barcode", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow({}, { description: "Yerba suave 1 kg" });
    const { id: productId } = await insertProduct(db, { name: "Yerba Suave 1 kg" });
    await appChoosing({ kind: "chosen", productId });

    const response = await proposal(headers, listId, rowId);

    expect(response.json()).toEqual({
      kind: "proposed",
      by: "ai",
      product: { id: productId, name: "Yerba Suave 1 kg" },
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

describe("GET /supplier-price-lists/:id with linked rows", () => {
  it("answers each row with its barcode, link, status and exact price per sale unit, and the counts", async () => {
    const { headers } = await manager();
    const { listId, rowId, actorId } = await extractedListWithRow(
      { pricesIncludeVat: true },
      { priceCents: 1_000, barcode: "7790000000011" },
    );
    const { productId, packagingId } = await productWithPackaging(actorId);
    await db
      .update(supplierPriceListRows)
      .set({ productId, packagingId })
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
            product: { id: productId, name: "Yerba 1 kg", saleUnit: "UNIT" },
            packaging: {
              id: packagingId,
              name: "Caja x 10",
              quantityPerPackage: 10_000,
              buyable: true,
            },
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

  it("answers each active product with the packagings it may be bought by, including a product with none", async () => {
    const { headers } = await manager();
    const actorId = await insertActor(db);
    const yerba = await insertProduct(db, { name: "Yerba 1 kg" });
    const caja = await insertPackaging(db, {
      productId: yerba.id,
      actorId,
      name: "Caja x 10",
      quantityPerPackage: 10_000,
    });
    await insertPackaging(db, { productId: yerba.id, actorId, name: "Vieja", active: false });
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
          packagings: [{ id: caja, name: "Caja x 10", quantityPerPackage: 10_000 }],
        },
        { id: harina.id, name: "Harina", saleUnit: "KG", packagings: [] },
      ]),
    );
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
