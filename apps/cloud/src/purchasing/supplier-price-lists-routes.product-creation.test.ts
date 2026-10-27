import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  categories,
  productBarcodes,
  productPackagings,
  products,
  supplierPriceListRows,
} from "../platform/db/schema.js";
import { BACKOFFICE_ORIGIN, signedInWith } from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { registerSupplierPriceListsRoutes } from "./supplier-price-lists-routes.js";
import {
  extractedListWithRow as sharedExtractedListWithRow,
  storedListRow,
  storedListVersion,
} from "./test-support/extracted-list-fixtures.js";
import {
  insertBarcode,
  insertLeafCategory,
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
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => NOW,
  });
});

afterEach(async () => {
  await app.close();
});

const manager = () => signedInWith(db, ["manage_supplier_price_lists"], NOW);

const extractedListWithRow = (
  list?: Parameters<typeof sharedExtractedListWithRow>[1],
  row?: Parameters<typeof sharedExtractedListWithRow>[2],
) => sharedExtractedListWithRow(db, list, row);

async function validBody(overrides: object = {}) {
  return {
    version: 1,
    name: "Yerba 1 kg",
    saleUnit: "UNIT",
    categoryId: await insertLeafCategory(db),
    barcodes: ["7790000000001"],
    packagingName: "Caja x 10",
    quantityPerPackage: 10_000,
    vatRate: 2_100,
    ...overrides,
  };
}

function createProduct(
  headers: Record<string, string>,
  listId: string,
  rowId: string,
  payload: object,
) {
  return app.inject({
    method: "POST",
    url: `/supplier-price-lists/${listId}/rows/${rowId}/product`,
    headers,
    payload,
  });
}

describe("authorization of the product creation route", () => {
  const url = `/supplier-price-lists/${MISSING_ID}/rows/${MISSING_ID}/product`;

  it("answers 401 when no session cookie was sent", async () => {
    const response = await app.inject({
      method: "POST",
      url,
      headers: { origin: BACKOFFICE_ORIGIN },
    });

    expect(response.statusCode).toBe(401);
  });

  it("answers 403 to a user without the permission to review supplier price lists, creating nothing", async () => {
    const { headers } = await signedInWith(db, ["record_purchases"], NOW);
    const { listId, rowId } = await extractedListWithRow();

    const response = await createProduct(headers, listId, rowId, await validBody());

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    expect(await db.select().from(products)).toHaveLength(0);
    expect((await storedListRow(db, rowId))?.productId).toBeNull();
  });
});

describe("POST /supplier-price-lists/:id/rows/:rowId/product", () => {
  it("rejects an Origin that is not the backoffice's own, creating nothing", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow();

    const response = await createProduct(
      { ...headers, origin: "https://attacker.example" },
      listId,
      rowId,
      await validBody(),
    );

    expect(response.statusCode).toBe(403);
    expect(await db.select().from(products)).toHaveLength(0);
  });

  it.each([
    ["no name", { name: "" }],
    ["a sale unit that is not offered", { saleUnit: "LITER" }],
    ["a category that is not an id", { categoryId: "not-an-id" }],
    ["a VAT rate that is not offered", { vatRate: 500 }],
    ["no version", { version: undefined }],
  ])("answers 400 for %s, creating nothing", async (_name, overrides) => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow();

    const response = await createProduct(headers, listId, rowId, await validBody(overrides));

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
    expect(await db.select().from(products)).toHaveLength(0);
  });

  it("creates the product with the given name and sale unit, its packaging and the link, and answers 201 with their ids", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow({}, { description: "Yerba 1 kg" });
    const body = await validBody({ saleUnit: "KG", barcodes: ["7791234567890"] });

    const response = await createProduct(headers, listId, rowId, body);

    expect(response.statusCode).toBe(201);
    const { productId, packagingId } = response.json() as {
      productId: string;
      packagingId: string;
    };
    const [product] = await db.select().from(products).where(eq(products.id, productId));
    expect(product).toMatchObject({
      name: "Yerba 1 kg",
      saleUnit: "KG",
      categoryId: body.categoryId,
      active: true,
    });
    const [packaging] = await db
      .select()
      .from(productPackagings)
      .where(eq(productPackagings.id, packagingId));
    expect(packaging).toMatchObject({ productId, name: "Caja x 10", quantityPerPackage: 10_000 });
    const barcodes = await db
      .select()
      .from(productBarcodes)
      .where(eq(productBarcodes.productId, productId));
    expect(barcodes.map((barcode) => barcode.code)).toEqual(["7791234567890"]);
    expect(await storedListRow(db, rowId)).toMatchObject({
      productId,
      packagingId,
      vatRate: 2_100,
      reviewed: true,
      linkedByPerson: true,
    });
    expect(await storedListVersion(db, listId)).toBe(2);
  });

  it("answers 404 for a list or a row that does not exist", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow();
    const body = await validBody();

    const noList = await createProduct(headers, MISSING_ID, rowId, body);
    const noRow = await createProduct(headers, listId, MISSING_ID, body);

    expect(noList.statusCode).toBe(404);
    expect(noList.json()).toMatchObject({ code: "not_found" });
    expect(noRow.statusCode).toBe(404);
    expect(await db.select().from(products)).toHaveLength(0);
  });

  it("answers 409 stale_version for a list changed since it was loaded, creating nothing", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow({ version: 3 });

    const response = await createProduct(headers, listId, rowId, await validBody({ version: 2 }));

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "stale_version" });
    expect(await db.select().from(products)).toHaveLength(0);
  });

  it("answers 409 not_editable for a list that was discarded", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow({ state: "DISCARDED" });

    const response = await createProduct(headers, listId, rowId, await validBody());

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "not_editable" });
  });

  it("answers 409 already_linked for a row that already has a product, creating nothing", async () => {
    const { headers } = await manager();
    const { listId, rowId, actorId } = await extractedListWithRow();
    const target = await insertProduct(db, { name: "Yerba" });
    const packagingId = await insertPackaging(db, { productId: target.id, actorId });
    await db
      .update(supplierPriceListRows)
      .set({ productId: target.id, packagingId })
      .where(eq(supplierPriceListRows.id, rowId));

    const response = await createProduct(headers, listId, rowId, await validBody());

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "already_linked" });
    expect(await db.select().from(products)).toHaveLength(1);
  });

  it("answers 400 naming quantityPerPackage for a fraction of a unit on a product sold by the unit, creating nothing", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow();

    const response = await createProduct(
      headers,
      listId,
      rowId,
      await validBody({ saleUnit: "UNIT", quantityPerPackage: 10_500 }),
    );

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "quantityPerPackage" }],
    });
    expect(await db.select().from(products)).toHaveLength(0);
  });

  it("answers 409 vat_rate_missing for a list whose prices exclude VAT when no rate was given, creating nothing", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow({ pricesIncludeVat: false });

    const response = await createProduct(
      headers,
      listId,
      rowId,
      await validBody({ vatRate: null }),
    );

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "vat_rate_missing" });
    expect(await db.select().from(products)).toHaveLength(0);
  });

  it("answers 400 naming categoryId for a category that does not exist, creating nothing", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow();

    const response = await createProduct(
      headers,
      listId,
      rowId,
      await validBody({ categoryId: MISSING_ID }),
    );

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "categoryId" }],
    });
    expect(await db.select().from(products)).toHaveLength(0);
  });

  it("answers 409 category_not_leaf for a category with subcategories, creating nothing", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow();
    const parentId = await insertLeafCategory(db);
    await db.insert(categories).values({ name: "Hijo", parentId });

    const response = await createProduct(
      headers,
      listId,
      rowId,
      await validBody({ categoryId: parentId }),
    );

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "category_not_leaf" });
    expect(await db.select().from(products)).toHaveLength(0);
  });

  it("answers 409 barcode_taken with the codes another active product carries, creating nothing", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow();
    const holder = await insertProduct(db, { name: "Otra yerba" });
    await insertBarcode(db, { productId: holder.id, code: "7791234567890" });

    const response = await createProduct(
      headers,
      listId,
      rowId,
      await validBody({ barcodes: ["7791234567890"] }),
    );

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ code: "barcode_taken", codes: ["7791234567890"] });
    expect(await db.select().from(products)).toHaveLength(1);
    expect((await storedListRow(db, rowId))?.productId).toBeNull();
  });
});
