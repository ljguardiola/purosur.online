import {
  brandListSchema,
  categoryListSchema,
  internalBarcodeSchema,
  tagListSchema,
} from "@purosur/contracts";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { brands, tags } from "../platform/db/schema.js";
import { BACKOFFICE_ORIGIN, signedInWith } from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { registerSupplierPriceListsRoutes } from "./supplier-price-lists-routes.js";
import { insertLeafCategory } from "./test-support/purchasing-fixtures.js";

const NOW = new Date("2026-09-16T15:00:00.000Z");

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

const getCategories = (headers: Record<string, string> = {}) =>
  app.inject({ method: "GET", url: "/supplier-price-lists/product-categories", headers });

const getBrands = (headers: Record<string, string> = {}) =>
  app.inject({ method: "GET", url: "/supplier-price-lists/product-brands", headers });

const getTags = (headers: Record<string, string> = {}) =>
  app.inject({ method: "GET", url: "/supplier-price-lists/product-tags", headers });

const postInternalBarcode = (headers: Record<string, string> = {}, payload: object = {}) =>
  app.inject({
    method: "POST",
    url: "/supplier-price-lists/internal-barcodes",
    headers: { origin: BACKOFFICE_ORIGIN, ...headers },
    payload,
  });

describe("GET /supplier-price-lists/product-categories", () => {
  it("answers 401 when no session cookie was sent", async () => {
    expect((await getCategories()).statusCode).toBe(401);
  });

  it("answers 403 to a user without the permission to review supplier price lists", async () => {
    const { headers } = await signedInWith(db, ["manage_products_and_categories"], NOW);

    const response = await getCategories(headers);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("lists the categories to a user who may only review supplier price lists", async () => {
    const categoryId = await insertLeafCategory(db);
    const { headers } = await signedInWith(db, ["manage_supplier_price_lists"], NOW);

    const response = await getCategories(headers);

    expect(response.statusCode).toBe(200);
    const listed = categoryListSchema.parse(response.json());
    expect(listed.map((category) => category.id)).toEqual([categoryId]);
  });
});

describe("GET /supplier-price-lists/product-brands", () => {
  it("answers 401 when no session cookie was sent", async () => {
    expect((await getBrands()).statusCode).toBe(401);
  });

  it("answers 403 to a user without the permission to review supplier price lists", async () => {
    const { headers } = await signedInWith(db, ["manage_products_and_categories"], NOW);

    const response = await getBrands(headers);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("lists the brands, the deactivated ones included, to a user who may only review supplier price lists", async () => {
    const [active] = await db.insert(brands).values({ name: "Dulcor" }).returning();
    const [inactive] = await db
      .insert(brands)
      .values({ name: "Granuz", active: false })
      .returning();
    const { headers } = await signedInWith(db, ["manage_supplier_price_lists"], NOW);

    const response = await getBrands(headers);

    expect(response.statusCode).toBe(200);
    const listed = brandListSchema.parse(response.json());
    expect(listed.map((brand) => brand.id)).toEqual([active?.id, inactive?.id]);
  });
});

describe("GET /supplier-price-lists/product-tags", () => {
  it("answers 401 when no session cookie was sent", async () => {
    expect((await getTags()).statusCode).toBe(401);
  });

  it("answers 403 to a user without the permission to review supplier price lists", async () => {
    const { headers } = await signedInWith(db, ["manage_products_and_categories"], NOW);

    const response = await getTags(headers);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("lists the tags, the deactivated ones included, to a user who may only review supplier price lists", async () => {
    const [active] = await db.insert(tags).values({ name: "Orgánico" }).returning();
    const [inactive] = await db.insert(tags).values({ name: "Vegano", active: false }).returning();
    const { headers } = await signedInWith(db, ["manage_supplier_price_lists"], NOW);

    const response = await getTags(headers);

    expect(response.statusCode).toBe(200);
    const listed = tagListSchema.parse(response.json());
    expect(listed.tags.map((tag) => tag.id)).toEqual([active?.id, inactive?.id]);
  });
});

describe("POST /supplier-price-lists/internal-barcodes", () => {
  it("answers 401 when no session cookie was sent", async () => {
    expect((await postInternalBarcode()).statusCode).toBe(401);
  });

  it("answers 403 to a user without the permission to review supplier price lists", async () => {
    const { headers } = await signedInWith(db, ["manage_products_and_categories"], NOW);

    const response = await postInternalBarcode(headers);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const { headers } = await signedInWith(db, ["manage_supplier_price_lists"], NOW);

    const response = await postInternalBarcode({ ...headers, origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
  });

  it("answers 400 to a body that is not the barcodes of the product", async () => {
    const { headers } = await signedInWith(db, ["manage_supplier_price_lists"], NOW);

    const response = await postInternalBarcode(headers, { barcodes: "not-a-list" });

    expect(response.statusCode).toBe(400);
  });

  it("allocates an internal barcode to a user who may only review supplier price lists", async () => {
    const { headers } = await signedInWith(db, ["manage_supplier_price_lists"], NOW);

    const first = await postInternalBarcode(headers, { barcodes: [] });
    const second = await postInternalBarcode(headers, { barcodes: [] });

    expect(first.statusCode).toBe(200);
    const firstCode = internalBarcodeSchema.parse(first.json()).code;
    const secondCode = internalBarcodeSchema.parse(second.json()).code;
    expect(secondCode).not.toBe(firstCode);
  });
});
