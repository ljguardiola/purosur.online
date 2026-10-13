import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { recipeComponents, recipes } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { registerRecipesRoutes } from "./recipes-routes.js";
import {
  BACKOFFICE_ORIGIN,
  insertProduct,
  signedInWith,
} from "./test-support/stock-route-fixtures.js";

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
  registerRecipesRoutes(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOW });
});

afterEach(async () => {
  await app.close();
});

function recipeManager() {
  return signedInWith(db, ["manage_recipes"], NOW);
}

function withoutRecipesPermission() {
  return signedInWith(
    db,
    [
      "view_stock_balances",
      "manage_suppliers",
      "manage_purchase_presentations",
      "record_purchases",
      "perform_stock_counts",
      "record_stock_losses",
      "adjust_stock",
      "record_initial_inventory",
    ],
    NOW,
  );
}

async function assembledProducts() {
  const mix = await insertProduct(db, {
    name: "Mix de frutos secos",
    categoryName: "Mezclas",
    saleUnit: "KG",
  });
  const nuts = await insertProduct(db, { name: "Nueces", saleUnit: "KG" });
  const bag = await insertProduct(db, { name: "Bolsa", saleUnit: "UNIT" });
  return { mix: mix.productId, nuts: nuts.productId, bag: bag.productId };
}

function save(
  headers: Record<string, string>,
  productId: string,
  payload: unknown,
  extraHeaders: Record<string, string> = {},
) {
  return app.inject({
    method: "PUT",
    url: `/recipes/${productId}`,
    headers: { ...headers, ...extraHeaders },
    payload: payload as Record<string, unknown>,
  });
}

describe("GET /recipes", () => {
  it("returns 401 when no session cookie was sent", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/recipes",
      headers: { origin: BACKOFFICE_ORIGIN },
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns 403 to a user holding every other stock and purchasing permission but not the recipes one", async () => {
    const { headers } = await withoutRecipesPermission();

    const response = await app.inject({ method: "GET", url: "/recipes", headers });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("lists the recipes with no last batch, and the active products a recipe may use", async () => {
    const { headers, userId } = await recipeManager();
    const { mix, nuts, bag } = await assembledProducts();
    await insertProduct(db, { name: "Retirado", active: false });
    await db.insert(recipes).values({ productId: mix, actorId: userId });
    await db.insert(recipeComponents).values([
      { productId: mix, componentProductId: bag, quantityPerOutputUnit: 1_000, position: 0 },
      { productId: mix, componentProductId: nuts, quantityPerOutputUnit: 600, position: 1 },
    ]);

    const response = await app.inject({ method: "GET", url: "/recipes", headers });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      recipes: [
        {
          productId: mix,
          productName: "Mix de frutos secos",
          categoryName: "Mezclas",
          saleUnit: "KG",
          version: 1,
          lastBatch: null,
          components: [
            {
              componentProductId: bag,
              name: "Bolsa",
              saleUnit: "UNIT",
              quantityPerOutputUnit: 1_000,
            },
            {
              componentProductId: nuts,
              name: "Nueces",
              saleUnit: "KG",
              quantityPerOutputUnit: 600,
            },
          ],
        },
      ],
      products: [
        { id: bag, name: "Bolsa", saleUnit: "UNIT" },
        { id: mix, name: "Mix de frutos secos", saleUnit: "KG" },
        { id: nuts, name: "Nueces", saleUnit: "KG" },
      ],
    });
  });
});

describe("PUT /recipes/:productId", () => {
  it("returns 403 to a user without the recipes permission, saving nothing", async () => {
    const { headers } = await withoutRecipesPermission();
    const { mix, nuts } = await assembledProducts();

    const response = await save(headers, mix, {
      components: [{ componentProductId: nuts, quantityPerOutputUnit: 600 }],
      version: null,
    });

    expect(response.statusCode).toBe(403);
    expect(await db.select().from(recipes)).toEqual([]);
  });

  it("rejects an Origin that is not the backoffice's own, saving nothing", async () => {
    const { headers } = await recipeManager();
    const { mix, nuts } = await assembledProducts();

    const response = await save(
      headers,
      mix,
      { components: [{ componentProductId: nuts, quantityPerOutputUnit: 600 }], version: null },
      { origin: "https://attacker.example" },
    );

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    expect(await db.select().from(recipes)).toEqual([]);
  });

  it("rejects a body the contract refuses with 400, saving nothing", async () => {
    const { headers } = await recipeManager();
    const { mix, nuts } = await assembledProducts();

    const response = await save(headers, mix, {
      components: [{ componentProductId: nuts, quantityPerOutputUnit: 0 }],
      version: null,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "components" }],
    });
    expect(await db.select().from(recipes)).toEqual([]);
  });

  it("rejects a product id that is not a record id with 400", async () => {
    const { headers } = await recipeManager();

    const response = await save(headers, "not-an-id", { components: [], version: null });

    expect(response.statusCode).toBe(400);
  });

  it("saves the recipe written by the signed-in user and answers it as the list shows it", async () => {
    const { headers, userId } = await recipeManager();
    const { mix, nuts, bag } = await assembledProducts();

    const response = await save(headers, mix, {
      components: [
        { componentProductId: nuts, quantityPerOutputUnit: 600 },
        { componentProductId: bag, quantityPerOutputUnit: 1_000 },
      ],
      version: null,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      productId: mix,
      productName: "Mix de frutos secos",
      categoryName: "Mezclas",
      saleUnit: "KG",
      version: 1,
      lastBatch: null,
      components: [
        { componentProductId: nuts, name: "Nueces", saleUnit: "KG", quantityPerOutputUnit: 600 },
        { componentProductId: bag, name: "Bolsa", saleUnit: "UNIT", quantityPerOutputUnit: 1_000 },
      ],
    });
    expect(await db.select().from(recipes)).toEqual([
      { productId: mix, version: 1, actorId: userId, updatedAt: NOW },
    ]);
  });

  it("replaces an existing recipe when the version loaded is the current one", async () => {
    const { headers } = await recipeManager();
    const { mix, nuts, bag } = await assembledProducts();
    await save(headers, mix, {
      components: [{ componentProductId: nuts, quantityPerOutputUnit: 600 }],
      version: null,
    });

    const response = await save(headers, mix, {
      components: [{ componentProductId: bag, quantityPerOutputUnit: 2_000 }],
      version: 1,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      version: 2,
      components: [{ componentProductId: bag }],
    });
    expect(
      await db.select().from(recipeComponents).where(eq(recipeComponents.productId, mix)),
    ).toHaveLength(1);
  });

  it("answers 404 product_not_found for an assembled product that does not exist", async () => {
    const { headers } = await recipeManager();
    const { nuts } = await assembledProducts();

    const response = await save(headers, MISSING_ID, {
      components: [{ componentProductId: nuts, quantityPerOutputUnit: 600 }],
      version: null,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "product_not_found" });
  });

  it("answers 400 component_not_found, naming the component, when it does not exist", async () => {
    const { headers } = await recipeManager();
    const { mix } = await assembledProducts();

    const response = await save(headers, mix, {
      components: [{ componentProductId: MISSING_ID, quantityPerOutputUnit: 600 }],
      version: null,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "component_not_found",
      componentProductId: MISSING_ID,
    });
  });

  it("answers 400 invalid_recipe for a recipe without components", async () => {
    const { headers } = await recipeManager();
    const { mix } = await assembledProducts();

    const response = await save(headers, mix, { components: [], version: null });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "invalid_recipe",
      reason: { kind: "no_components" },
    });
  });

  it("answers 400 invalid_recipe for the assembled product used as its own component", async () => {
    const { headers } = await recipeManager();
    const { mix } = await assembledProducts();

    const response = await save(headers, mix, {
      components: [{ componentProductId: mix, quantityPerOutputUnit: 600 }],
      version: null,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "invalid_recipe",
      reason: { kind: "self_component" },
    });
  });

  it("answers 400 invalid_recipe for a fractional quantity of a component sold by the unit", async () => {
    const { headers } = await recipeManager();
    const { mix, bag } = await assembledProducts();

    const response = await save(headers, mix, {
      components: [{ componentProductId: bag, quantityPerOutputUnit: 1_500 }],
      version: null,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "invalid_recipe",
      reason: { kind: "invalid_quantity", componentProductId: bag },
    });
  });

  it("answers 409 stale_version when the recipe changed since it was loaded, leaving it unchanged", async () => {
    const { headers } = await recipeManager();
    const { mix, nuts, bag } = await assembledProducts();
    await save(headers, mix, {
      components: [{ componentProductId: nuts, quantityPerOutputUnit: 600 }],
      version: null,
    });

    const response = await save(headers, mix, {
      components: [{ componentProductId: bag, quantityPerOutputUnit: 1_000 }],
      version: null,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "stale_version" });
    expect(
      await db.select().from(recipeComponents).where(eq(recipeComponents.productId, mix)),
    ).toMatchObject([{ componentProductId: nuts }]);
  });
});
