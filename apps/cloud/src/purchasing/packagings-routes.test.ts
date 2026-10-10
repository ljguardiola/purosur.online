import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { productPackagings } from "../platform/db/schema.js";
import { BACKOFFICE_ORIGIN, signedInWith } from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { registerPackagingsRoutes } from "./packagings-routes.js";
import { insertActor, insertProduct } from "./test-support/purchasing-fixtures.js";

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
  registerPackagingsRoutes(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOW });
});

afterEach(async () => {
  await app.close();
});

function manager() {
  return signedInWith(db, ["manage_purchase_presentations"], NOW);
}

function withoutPermission() {
  return signedInWith(db, ["sell_and_charge"], NOW);
}

async function storedPackaging(
  productId: string,
  fields: Partial<typeof productPackagings.$inferInsert> = {},
): Promise<{ id: string; version: number }> {
  const [row] = await db
    .insert(productPackagings)
    .values({
      productId,
      name: "Caja x 12",
      quantityPerPackage: 12_000,
      saleUnit: "UNIT",
      actorId: await insertActor(db),
      ...fields,
    })
    .returning({ id: productPackagings.id, version: productPackagings.version });
  if (!row) {
    throw new Error("test setup: seeding the packaging returned no row");
  }
  return row;
}

describe("GET /purchase-packagings", () => {
  it("returns 401 when no session cookie was sent", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/purchase-packagings",
      headers: { origin: BACKOFFICE_ORIGIN },
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns 403 to a user without the purchase packagings permission", async () => {
    const { headers } = await withoutPermission();

    const response = await app.inject({ method: "GET", url: "/purchase-packagings", headers });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("lets a user who can only record purchases read the list", async () => {
    const { headers } = await signedInWith(db, ["record_purchases"], NOW);

    const response = await app.inject({ method: "GET", url: "/purchase-packagings", headers });

    expect(response.statusCode).toBe(200);
  });

  it("lists the packagings with their product's name and current sale unit, and the active products to define one for", async () => {
    const { headers } = await manager();
    const arroz = await insertProduct(db, { name: "Arroz", saleUnit: "UNIT" });
    const retired = await insertProduct(db, { name: "Retirado", active: false });
    await storedPackaging(retired.id, { name: "Bolsa", saleUnit: "KG", active: false });
    await storedPackaging(arroz.id);

    const response = await app.inject({ method: "GET", url: "/purchase-packagings", headers });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      packagings: [
        {
          id: expect.any(String),
          productId: retired.id,
          productName: "Retirado",
          productSaleUnit: "UNIT",
          saleUnit: "KG",
          saleUnitChanged: true,
          name: "Bolsa",
          quantityPerPackage: 12_000,
          active: false,
          version: 1,
        },
        {
          id: expect.any(String),
          productId: arroz.id,
          productName: "Arroz",
          productSaleUnit: "UNIT",
          saleUnit: "UNIT",
          saleUnitChanged: false,
          name: "Caja x 12",
          quantityPerPackage: 12_000,
          active: true,
          version: 1,
        },
      ],
      products: [{ id: arroz.id, name: "Arroz", saleUnit: "UNIT" }],
    });
  });
});

describe("POST /purchase-packagings", () => {
  it("returns 403 to a user without the purchase packagings permission, creating nothing", async () => {
    const { headers } = await withoutPermission();
    const product = await insertProduct(db, { name: "Arroz" });

    const response = await app.inject({
      method: "POST",
      url: "/purchase-packagings",
      headers,
      payload: { productId: product.id, name: "Caja", quantityPerPackage: 12_000 },
    });

    expect(response.statusCode).toBe(403);
    expect(await db.select().from(productPackagings)).toEqual([]);
  });

  it("rejects an Origin that is not the backoffice's own, creating nothing", async () => {
    const { headers } = await manager();
    const product = await insertProduct(db, { name: "Arroz" });

    const response = await app.inject({
      method: "POST",
      url: "/purchase-packagings",
      headers: { ...headers, origin: "https://attacker.example" },
      payload: { productId: product.id, name: "Caja", quantityPerPackage: 12_000 },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    expect(await db.select().from(productPackagings)).toEqual([]);
  });

  it("rejects a body the contract refuses with 400, creating nothing", async () => {
    const { headers } = await manager();
    const product = await insertProduct(db, { name: "Arroz" });

    const response = await app.inject({
      method: "POST",
      url: "/purchase-packagings",
      headers,
      payload: { productId: product.id, name: "Caja", quantityPerPackage: 0 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "quantityPerPackage" }],
    });
    expect(await db.select().from(productPackagings)).toEqual([]);
  });

  it("creates the packaging written by the signed-in user and answers it with its product's name and sale unit", async () => {
    const { headers, userId } = await manager();
    const product = await insertProduct(db, { name: "Arroz", saleUnit: "KG" });

    const response = await app.inject({
      method: "POST",
      url: "/purchase-packagings",
      headers,
      payload: { productId: product.id, name: " Bolsa x 25 kg ", quantityPerPackage: 25_000 },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toEqual({
      id: expect.any(String),
      productId: product.id,
      productName: "Arroz",
      productSaleUnit: "KG",
      saleUnit: "KG",
      saleUnitChanged: false,
      name: "Bolsa x 25 kg",
      quantityPerPackage: 25_000,
      active: true,
      version: 1,
    });
    expect(await db.select().from(productPackagings)).toMatchObject([
      { id: body.id, actorId: userId },
    ]);
  });

  it("answers 404 product_not_found for a product that does not exist", async () => {
    const { headers } = await manager();

    const response = await app.inject({
      method: "POST",
      url: "/purchase-packagings",
      headers,
      payload: { productId: MISSING_ID, name: "Caja", quantityPerPackage: 12_000 },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "product_not_found" });
  });

  it("answers 404 product_not_found for a deactivated product, creating nothing", async () => {
    const { headers } = await manager();
    const product = await insertProduct(db, { name: "Retirado", active: false });

    const response = await app.inject({
      method: "POST",
      url: "/purchase-packagings",
      headers,
      payload: { productId: product.id, name: "Caja", quantityPerPackage: 12_000 },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "product_not_found" });
    expect(await db.select().from(productPackagings)).toEqual([]);
  });

  it("answers 400 for a part of a unit on a product sold by the unit", async () => {
    const { headers } = await manager();
    const product = await insertProduct(db, { name: "Arroz", saleUnit: "UNIT" });

    const response = await app.inject({
      method: "POST",
      url: "/purchase-packagings",
      headers,
      payload: { productId: product.id, name: "Caja", quantityPerPackage: 1_500 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "quantityPerPackage" }],
    });
    expect(await db.select().from(productPackagings)).toEqual([]);
  });

  it("answers 409 packaging_name_taken for a name the product's other packaging has", async () => {
    const { headers } = await manager();
    const product = await insertProduct(db, { name: "Arroz" });
    await storedPackaging(product.id);

    const response = await app.inject({
      method: "POST",
      url: "/purchase-packagings",
      headers,
      payload: { productId: product.id, name: "caja X 12", quantityPerPackage: 6_000 },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "packaging_name_taken" });
  });
});

describe("PUT /purchase-packagings/:id", () => {
  it("returns 403 to a user without the purchase packagings permission, changing nothing", async () => {
    const { headers } = await withoutPermission();
    const product = await insertProduct(db, { name: "Arroz" });
    const packaging = await storedPackaging(product.id);

    const response = await app.inject({
      method: "PUT",
      url: `/purchase-packagings/${packaging.id}`,
      headers,
      payload: { name: "Nueva", quantityPerPackage: 6_000, version: packaging.version },
    });

    expect(response.statusCode).toBe(403);
    expect(await db.select().from(productPackagings)).toMatchObject([{ name: "Caja x 12" }]);
  });

  it("edits the packaging, answering it at its next version with its product's name and sale unit", async () => {
    const { headers } = await manager();
    const product = await insertProduct(db, { name: "Arroz" });
    const packaging = await storedPackaging(product.id);

    const response = await app.inject({
      method: "PUT",
      url: `/purchase-packagings/${packaging.id}`,
      headers,
      payload: { name: "Caja x 6", quantityPerPackage: 6_000, version: 1 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: packaging.id,
      productId: product.id,
      productName: "Arroz",
      productSaleUnit: "UNIT",
      saleUnit: "UNIT",
      saleUnitChanged: false,
      name: "Caja x 6",
      quantityPerPackage: 6_000,
      active: true,
      version: 2,
    });
  });

  it("answers 404 for a packaging that does not exist", async () => {
    const { headers } = await manager();

    const response = await app.inject({
      method: "PUT",
      url: `/purchase-packagings/${MISSING_ID}`,
      headers,
      payload: { name: "Caja", quantityPerPackage: 6_000, version: 1 },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
  });

  it("answers 409 stale_version for a packaging changed since it was loaded, changing nothing", async () => {
    const { headers } = await manager();
    const product = await insertProduct(db, { name: "Arroz" });
    const packaging = await storedPackaging(product.id, { version: 4 });

    const response = await app.inject({
      method: "PUT",
      url: `/purchase-packagings/${packaging.id}`,
      headers,
      payload: { name: "Nueva", quantityPerPackage: 6_000, version: 1 },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "stale_version" });
    expect(await db.select().from(productPackagings)).toMatchObject([{ name: "Caja x 12" }]);
  });

  it("answers 400 for a part of a unit on a product sold by the unit", async () => {
    const { headers } = await manager();
    const product = await insertProduct(db, { name: "Arroz" });
    const packaging = await storedPackaging(product.id);

    const response = await app.inject({
      method: "PUT",
      url: `/purchase-packagings/${packaging.id}`,
      headers,
      payload: { name: "Caja x 12", quantityPerPackage: 1_500, version: 1 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "quantityPerPackage" }],
    });
  });

  it("answers 409 packaging_name_taken for a name the product's other packaging has", async () => {
    const { headers } = await manager();
    const product = await insertProduct(db, { name: "Arroz" });
    await storedPackaging(product.id);
    const second = await storedPackaging(product.id, { name: "Bolsa" });

    const response = await app.inject({
      method: "PUT",
      url: `/purchase-packagings/${second.id}`,
      headers,
      payload: { name: "CAJA x 12", quantityPerPackage: 12_000, version: 1 },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "packaging_name_taken" });
  });

  it("answers 400 for an id that is not a record id", async () => {
    const { headers } = await manager();

    const response = await app.inject({
      method: "PUT",
      url: "/purchase-packagings/not-an-id",
      headers,
      payload: { name: "Caja", quantityPerPackage: 6_000, version: 1 },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("PUT and DELETE /purchase-packagings/:id/deactivation", () => {
  it("returns 403 to a user without the purchase packagings permission, changing nothing", async () => {
    const { headers } = await withoutPermission();
    const product = await insertProduct(db, { name: "Arroz" });
    const active = await storedPackaging(product.id);
    const inactive = await storedPackaging(product.id, { name: "Bolsa", active: false });

    const deactivation = await app.inject({
      method: "PUT",
      url: `/purchase-packagings/${active.id}/deactivation`,
      headers,
    });
    const reactivation = await app.inject({
      method: "DELETE",
      url: `/purchase-packagings/${inactive.id}/deactivation`,
      headers,
    });

    expect(deactivation.statusCode).toBe(403);
    expect(reactivation.statusCode).toBe(403);
    expect(await db.select({ active: productPackagings.active }).from(productPackagings)).toEqual(
      expect.arrayContaining([{ active: true }, { active: false }]),
    );
  });

  it("deactivates then reactivates the packaging, written by the signed-in user", async () => {
    const { headers, userId } = await manager();
    const product = await insertProduct(db, { name: "Arroz" });
    const packaging = await storedPackaging(product.id);

    const deactivation = await app.inject({
      method: "PUT",
      url: `/purchase-packagings/${packaging.id}/deactivation`,
      headers,
    });
    const [deactivated] = await db
      .select()
      .from(productPackagings)
      .where(eq(productPackagings.id, packaging.id));
    const reactivation = await app.inject({
      method: "DELETE",
      url: `/purchase-packagings/${packaging.id}/deactivation`,
      headers,
    });
    const [reactivated] = await db
      .select()
      .from(productPackagings)
      .where(eq(productPackagings.id, packaging.id));

    expect(deactivation.statusCode).toBe(200);
    expect(deactivated).toMatchObject({ active: false, version: 2, actorId: userId });
    expect(reactivation.statusCode).toBe(200);
    expect(reactivated).toMatchObject({ active: true, version: 3, actorId: userId });
  });

  it("answers 404 for a packaging that does not exist", async () => {
    const { headers } = await manager();

    const deactivation = await app.inject({
      method: "PUT",
      url: `/purchase-packagings/${MISSING_ID}/deactivation`,
      headers,
    });
    const reactivation = await app.inject({
      method: "DELETE",
      url: `/purchase-packagings/${MISSING_ID}/deactivation`,
      headers,
    });

    expect(deactivation.statusCode).toBe(404);
    expect(reactivation.statusCode).toBe(404);
  });

  it("answers 409 packaging_already_inactive and packaging_already_active", async () => {
    const { headers } = await manager();
    const product = await insertProduct(db, { name: "Arroz" });
    const active = await storedPackaging(product.id);
    const inactive = await storedPackaging(product.id, { name: "Bolsa", active: false });

    const alreadyInactive = await app.inject({
      method: "PUT",
      url: `/purchase-packagings/${inactive.id}/deactivation`,
      headers,
    });
    const alreadyActive = await app.inject({
      method: "DELETE",
      url: `/purchase-packagings/${active.id}/deactivation`,
      headers,
    });

    expect(alreadyInactive.statusCode).toBe(409);
    expect(alreadyInactive.json()).toMatchObject({ code: "packaging_already_inactive" });
    expect(alreadyActive.statusCode).toBe(409);
    expect(alreadyActive.json()).toMatchObject({ code: "packaging_already_active" });
  });

  it("answers 409 packaging_sale_unit_changed when reactivating a packaging stated in a sale unit its product no longer has, changing nothing", async () => {
    const { headers } = await manager();
    const product = await insertProduct(db, { name: "Arroz", saleUnit: "UNIT" });
    const packaging = await storedPackaging(product.id, { saleUnit: "KG", active: false });

    const response = await app.inject({
      method: "DELETE",
      url: `/purchase-packagings/${packaging.id}/deactivation`,
      headers,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "packaging_sale_unit_changed" });
    expect(await db.select().from(productPackagings)).toMatchObject([
      { active: false, version: 1 },
    ]);
  });

  it("answers 400 for an id that is not a record id", async () => {
    const { headers } = await manager();

    const response = await app.inject({
      method: "PUT",
      url: "/purchase-packagings/not-an-id/deactivation",
      headers,
    });

    expect(response.statusCode).toBe(400);
  });
});
