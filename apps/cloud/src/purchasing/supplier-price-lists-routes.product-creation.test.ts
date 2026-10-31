import { PRODUCT_NAME_MAX_LENGTH } from "@purosur/domain";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  brands,
  categories,
  productBarcodes,
  products,
  productTags,
  supplierPriceListRows,
  tags,
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
import {
  insertBarcode,
  insertLeafCategory,
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
    zoneRules: fixedZoneRulesSource(),
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
    name: "Yerba mate 1 kg",
    saleUnit: "UNIT",
    categoryId: await insertLeafCategory(db),
    brandId: null,
    barcodes: ["7790000000001"],
    tagIds: [],
    netContent: null,
    quantity: 10_000,
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

  it("answers 400 for a body the contract refuses, creating nothing", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow();

    const response = await createProduct(
      headers,
      listId,
      rowId,
      await validBody({ saleUnit: "LITER" }),
    );

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "saleUnit" }],
    });
    expect(await db.select().from(products)).toHaveLength(0);
  });

  it("creates the product named as given, with the given sale unit, links the row to it with the quantity given, and answers 201 with its id", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow(
      {},
      { description: "Yerba 1 kg", presentation: "Caja x 10" },
    );
    const body = await validBody({
      saleUnit: "KG",
      barcodes: ["7791234567890"],
    });

    const response = await createProduct(headers, listId, rowId, body);

    expect(response.statusCode).toBe(201);
    const { productId } = response.json() as { productId: string };
    const [product] = await db.select().from(products).where(eq(products.id, productId));
    expect(product).toMatchObject({
      name: "Yerba mate 1 kg",
      saleUnit: "KG",
      categoryId: body.categoryId,
      active: true,
    });
    const barcodes = await db
      .select()
      .from(productBarcodes)
      .where(eq(productBarcodes.productId, productId));
    expect(barcodes.map((barcode) => barcode.code)).toEqual(["7791234567890"]);
    expect(await storedListRow(db, rowId)).toMatchObject({
      productId,
      quantity: 10_000,
      saleUnit: "KG",
      vatRate: 2_100,
      reviewed: true,
      linkedByPerson: true,
    });
    expect(await storedListVersion(db, listId)).toBe(2);
  });

  it("creates the product with the brand, the tags and the net content given", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow();
    const [brand] = await db.insert(brands).values({ name: "Dulcor" }).returning();
    const [tag] = await db.insert(tags).values({ name: "Vegano" }).returning();
    const body = await validBody({
      brandId: brand?.id,
      tagIds: [tag?.id],
      netContent: { quantity: 125, unit: "ML" },
    });

    const response = await createProduct(headers, listId, rowId, body);

    expect(response.statusCode).toBe(201);
    const { productId } = response.json() as { productId: string };
    const [product] = await db.select().from(products).where(eq(products.id, productId));
    expect(product).toMatchObject({
      brandId: brand?.id,
      netContentQuantity: 125,
      netContentUnit: "ML",
    });
    const tagged = await db.select().from(productTags).where(eq(productTags.productId, productId));
    expect(tagged.map((row) => row.tagId)).toEqual([tag?.id]);
  });

  it("answers 400 naming netContentQuantity for a net content quantity that is not valid, creating nothing", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow();

    const response = await createProduct(
      headers,
      listId,
      rowId,
      await validBody({ netContent: { quantity: 0, unit: "ML" } }),
    );

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "netContentQuantity" }],
    });
    expect(await db.select().from(products)).toHaveLength(0);
  });

  it("answers 400 naming name for a blank name, creating nothing", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow();

    const response = await createProduct(headers, listId, rowId, await validBody({ name: " " }));

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "name" }],
    });
    expect(await db.select().from(products)).toHaveLength(0);
  });

  it("answers 400 naming brandId for a brand that does not exist, creating nothing", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow();

    const response = await createProduct(
      headers,
      listId,
      rowId,
      await validBody({ brandId: MISSING_ID }),
    );

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "brandId" }],
    });
    expect(await db.select().from(products)).toHaveLength(0);
  });

  it("answers 409 brand_inactive for a deactivated brand, creating nothing", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow();
    const [brand] = await db.insert(brands).values({ name: "Dulcor", active: false }).returning();

    const response = await createProduct(
      headers,
      listId,
      rowId,
      await validBody({ brandId: brand?.id }),
    );

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "brand_inactive" });
    expect(await db.select().from(products)).toHaveLength(0);
  });

  it("answers 400 naming tagIds for a tag that does not exist, creating nothing", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow();

    const response = await createProduct(
      headers,
      listId,
      rowId,
      await validBody({ tagIds: [MISSING_ID] }),
    );

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "tagIds" }],
    });
    expect(await db.select().from(products)).toHaveLength(0);
  });

  it("answers 409 tag_inactive naming the deactivated tag, creating nothing", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow();
    const [tag] = await db.insert(tags).values({ name: "Vegano", active: false }).returning();

    const response = await createProduct(
      headers,
      listId,
      rowId,
      await validBody({ tagIds: [tag?.id] }),
    );

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "tag_inactive", tagId: tag?.id });
    expect(await db.select().from(products)).toHaveLength(0);
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
    const { listId, rowId } = await extractedListWithRow();
    const target = await insertProduct(db, { name: "Yerba" });
    await db
      .update(supplierPriceListRows)
      .set({ productId: target.id, quantity: 1_000, saleUnit: "UNIT" })
      .where(eq(supplierPriceListRows.id, rowId));

    const response = await createProduct(headers, listId, rowId, await validBody());

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "already_linked" });
    expect(await db.select().from(products)).toHaveLength(1);
  });

  it("answers 400 naming quantity for a fraction of a unit on a product sold by the unit, creating nothing", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow();

    const response = await createProduct(
      headers,
      listId,
      rowId,
      await validBody({ saleUnit: "UNIT", quantity: 10_500 }),
    );

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "quantity" }],
    });
    expect(await db.select().from(products)).toHaveLength(0);
  });

  it("creates the product named as given even when the item's description is longer than a product's name may be", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow(
      {},
      { description: "a".repeat(PRODUCT_NAME_MAX_LENGTH + 1) },
    );

    const response = await createProduct(headers, listId, rowId, await validBody());

    expect(response.statusCode).toBe(201);
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
