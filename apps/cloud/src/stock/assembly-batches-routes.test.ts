import { saveRecipe } from "@purosur/domain/stock/use-cases";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assemblyBatches, stockMovements } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { registerAssemblyBatchesRoutes } from "./assembly-batches-routes.js";
import { DrizzleRecipeStore } from "./drizzle-recipe-store.js";
import { insertAssemblyBatch } from "./test-support/assembly-batch-fixtures.js";
import { insertPurchasedLot } from "./test-support/lot-fixtures.js";
import {
  BACKOFFICE_ORIGIN,
  insertBalance,
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
  registerAssemblyBatchesRoutes(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOW });
});

afterEach(async () => {
  await app.close();
});

function batchMaker() {
  return signedInWith(db, ["manage_batches"], NOW);
}

function withoutBatchesPermission() {
  return signedInWith(db, ["manage_recipes", "view_stock_balances", "adjust_stock"], NOW);
}

async function mixWithStock(actorId: string, locationId: string) {
  const mix = await insertProduct(db, { name: "Mix de frutos secos", saleUnit: "KG" });
  const nuts = await insertProduct(db, { name: "Nueces", saleUnit: "KG" });
  const bag = await insertProduct(db, { name: "Bolsa", saleUnit: "UNIT" });
  await saveRecipe(new DrizzleRecipeStore(db, () => NOW), {
    productId: mix.productId,
    components: [
      { componentProductId: nuts.productId, quantityPerOutputUnit: 600 },
      { componentProductId: bag.productId, quantityPerOutputUnit: 1_000 },
    ],
    version: null,
    actorId,
  });
  await insertPurchasedLot(db, {
    productId: nuts.productId,
    locationId,
    actorId,
    expiresOn: "2027-01-15",
    remaining: 15_000,
  });
  await insertPurchasedLot(db, {
    productId: bag.productId,
    locationId,
    actorId,
    remaining: 50_000,
  });
  await insertBalance(db, { productId: nuts.productId, locationId, quantity: 15_000 });
  await insertBalance(db, { productId: bag.productId, locationId, quantity: 50_000 });
  return { mix: mix.productId, nuts: nuts.productId, bag: bag.productId };
}

function body(ids: { mix: string; nuts: string; bag: string }, overrides = {}) {
  return {
    productId: ids.mix,
    recipeVersion: 1,
    used: [
      { componentProductId: ids.nuts, quantity: 12_000 },
      { componentProductId: ids.bag, quantity: 2_000 },
    ],
    output: 14_000,
    ...overrides,
  };
}

function post(headers: Record<string, string>, payload: unknown) {
  return app.inject({
    method: "POST",
    url: "/assembly-batches",
    headers,
    payload: payload as Record<string, unknown>,
  });
}

describe("GET /assembly-batches", () => {
  it("returns 401 when no session cookie was sent", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/assembly-batches",
      headers: { origin: BACKOFFICE_ORIGIN },
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns 403 to a user holding other stock permissions but not the batches one", async () => {
    const { headers } = await withoutBatchesPermission();

    const response = await app.inject({ method: "GET", url: "/assembly-batches", headers });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("lists the branch's batches of the period newest first, with the recipes a batch may be made from, to a role that cannot manage recipes", async () => {
    const { headers, userId, locationId } = await batchMaker();
    const ids = await mixWithStock(userId, locationId);
    for (const at of [
      "2026-09-10T10:00:00.000Z",
      "2026-09-14T10:00:00.000Z",
      "2026-07-01T10:00:00.000Z",
    ]) {
      await insertAssemblyBatch(db, {
        productId: ids.mix,
        locationId,
        actorId: userId,
        assembledAt: new Date(at),
        used: [{ componentProductId: ids.nuts, quantity: 6_000 }],
      });
    }

    const response = await app.inject({ method: "GET", url: "/assembly-batches?days=30", headers });

    expect(response.statusCode).toBe(200);
    const listed = response.json();
    expect(listed.batches.map((batch: { assembledAt: string }) => batch.assembledAt)).toEqual([
      "2026-09-14T10:00:00.000Z",
      "2026-09-10T10:00:00.000Z",
    ]);
    expect(listed.batches[0]).toMatchObject({
      productName: "Mix de frutos secos",
      unitCostCents: 3_586,
      lines: [{ name: "Nueces", quantity: 6_000 }],
    });
    expect(listed.recipes).toMatchObject([
      { productId: ids.mix, version: 1, lastBatch: { assembledAt: "2026-09-14T10:00:00.000Z" } },
    ]);
  });

  it("defaults to the last thirty days", async () => {
    const { headers, userId, locationId } = await batchMaker();
    const ids = await mixWithStock(userId, locationId);
    await insertAssemblyBatch(db, {
      productId: ids.mix,
      locationId,
      actorId: userId,
      assembledAt: new Date("2026-07-01T10:00:00.000Z"),
    });

    const response = await app.inject({ method: "GET", url: "/assembly-batches", headers });

    expect(response.json().batches).toEqual([]);
  });
});

describe("GET /assembly-batches/preview", () => {
  async function preview(headers: Record<string, string>, query: string) {
    return app.inject({ method: "GET", url: `/assembly-batches/preview?${query}`, headers });
  }

  it("returns 403 to a user without the batches permission", async () => {
    const { headers } = await withoutBatchesPermission();

    expect((await preview(headers, `productId=${MISSING_ID}&size=1000`)).statusCode).toBe(403);
  });

  it("proposes the quantities of the recipe for the size and plans the lots they would be taken from", async () => {
    const { headers, userId, locationId } = await batchMaker();
    const ids = await mixWithStock(userId, locationId);

    const response = await preview(headers, `productId=${ids.mix}&size=10000&output=10000`);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      recipeVersion: 1,
      proposal: {
        used: [
          { componentProductId: ids.nuts, quantity: 6_000 },
          { componentProductId: ids.bag, quantity: 10_000 },
        ],
        output: null,
      },
      planned: [
        {
          componentProductId: ids.nuts,
          allocations: [{ quantity: 6_000, expiresOn: "2027-01-15" }],
        },
        { componentProductId: ids.bag, allocations: [{ quantity: 10_000, expiresOn: null }] },
      ],
      lot: { costTotalCents: 80_000, costQuantity: 10_000, expiresOn: "2027-01-15" },
    });
  });

  it("plans the quantities given in place of the proposal", async () => {
    const { headers, userId, locationId } = await batchMaker();
    const ids = await mixWithStock(userId, locationId);

    const response = await preview(
      headers,
      `productId=${ids.mix}&size=10000&used=${ids.nuts}:2000&used=${ids.bag}:0`,
    );

    expect(response.json()).toMatchObject({
      used: [
        { componentProductId: ids.nuts, quantity: 2_000 },
        { componentProductId: ids.bag, quantity: 0 },
      ],
      lot: null,
    });
  });

  it("returns 400 for a query that does not follow the shape", async () => {
    const { headers } = await batchMaker();

    const response = await preview(headers, `productId=${MISSING_ID}&size=0`);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "size" }],
    });
  });

  it("returns 404 for a product without a recipe", async () => {
    const { headers } = await batchMaker();
    const plain = await insertProduct(db, { name: "Sin receta", saleUnit: "UNIT" });

    const noRecipe = await preview(headers, `productId=${plain.productId}&size=1000`);

    expect(noRecipe.statusCode).toBe(404);
    expect(noRecipe.json()).toMatchObject({ code: "no_recipe" });
  });

  it("returns 400 invalid_size for a fractional size of a product sold by the unit", async () => {
    const { headers, userId, locationId } = await batchMaker();
    const unitsMix = await insertProduct(db, { name: "Caja", saleUnit: "UNIT" });
    const ids = await mixWithStock(userId, locationId);
    await saveRecipe(new DrizzleRecipeStore(db, () => NOW), {
      productId: unitsMix.productId,
      components: [{ componentProductId: ids.nuts, quantityPerOutputUnit: 1_000 }],
      version: null,
      actorId: userId,
    });

    const response = await preview(headers, `productId=${unitsMix.productId}&size=1500`);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "invalid_size" });
  });

  it("returns 409 for quantities that are not the components of the recipe and 400 for an invalid quantity", async () => {
    const { headers, userId, locationId } = await batchMaker();
    const ids = await mixWithStock(userId, locationId);

    const stale = await preview(headers, `productId=${ids.mix}&size=1000&used=${ids.nuts}:100`);
    const invalid = await preview(
      headers,
      `productId=${ids.mix}&size=1000&used=${ids.nuts}:100&used=${ids.bag}:1500`,
    );
    const output = await preview(headers, `productId=${ids.mix}&size=1000&output=1500`);

    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ code: "stale_recipe" });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ code: "invalid_quantity", componentProductId: ids.bag });
    expect(output.statusCode).toBe(200);
  });
});

describe("POST /assembly-batches", () => {
  it("returns 401 when no session cookie was sent", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/assembly-batches",
      headers: { origin: BACKOFFICE_ORIGIN },
      payload: {},
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns 403 to a user without the batches permission, writing nothing", async () => {
    const { headers, userId, locationId } = await withoutBatchesPermission();
    const ids = await mixWithStock(userId, locationId);

    const response = await post(headers, body(ids));

    expect(response.statusCode).toBe(403);
    expect(await db.select().from(assemblyBatches)).toEqual([]);
  });

  it("rejects a request from another origin", async () => {
    const { headers, userId, locationId } = await batchMaker();
    const ids = await mixWithStock(userId, locationId);

    const response = await app.inject({
      method: "POST",
      url: "/assembly-batches",
      headers: { ...headers, origin: "https://attacker.example" },
      payload: body(ids),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("registers the batch and answers it with its cost and expiry, made by the signed-in user at the session's branch", async () => {
    const { headers, userId, locationId } = await batchMaker();
    const ids = await mixWithStock(userId, locationId);

    const response = await post(headers, body(ids));

    expect(response.statusCode).toBe(200);
    const { batch } = response.json();
    expect(batch).toEqual({
      id: expect.any(String),
      productId: ids.mix,
      assembledAt: NOW.toISOString(),
      output: 14_000,
      unitCostCents: 5_000,
      costIncomplete: false,
      expiresOn: "2027-01-15",
    });
    const [stored] = await db.select().from(assemblyBatches);
    expect(stored).toMatchObject({ id: batch.id, locationId, actorId: userId });
    const movements = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.assemblyBatchId, batch.id));
    expect(movements).toHaveLength(3);
  });

  it("returns 400 for a body that is not the shape", async () => {
    const { headers } = await batchMaker();

    const response = await post(headers, { productId: "x" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });

  it("answers each refusal of the batch with its own response and writes nothing", async () => {
    const { headers, userId, locationId } = await batchMaker();
    const ids = await mixWithStock(userId, locationId);
    const plain = await insertProduct(db, { name: "Sin receta", saleUnit: "UNIT" });
    const refused = async (payload: unknown) => {
      const response = await post(headers, payload);
      return { status: response.statusCode, body: response.json() };
    };

    expect(await refused(body(ids, { productId: MISSING_ID }))).toMatchObject({
      status: 404,
      body: { code: "product_not_found" },
    });
    expect(await refused(body(ids, { productId: plain.productId }))).toMatchObject({
      status: 404,
      body: { code: "no_recipe" },
    });
    expect(await refused(body(ids, { recipeVersion: 9 }))).toMatchObject({
      status: 409,
      body: { code: "stale_recipe" },
    });
    expect(
      await refused(
        body(ids, {
          used: [
            { componentProductId: ids.nuts, quantity: 12_000 },
            { componentProductId: ids.bag, quantity: 2_500 },
          ],
        }),
      ),
    ).toMatchObject({
      status: 400,
      body: { code: "invalid_quantity", componentProductId: ids.bag },
    });
    expect(
      await refused(
        body(ids, {
          used: [
            { componentProductId: ids.nuts, quantity: 0 },
            { componentProductId: ids.bag, quantity: 0 },
          ],
        }),
      ),
    ).toMatchObject({ status: 400, body: { code: "nothing_used" } });
    expect(await refused(body(ids, { output: 1.5 }))).toMatchObject({
      status: 400,
      body: { code: "validation_failed" },
    });
    expect(await db.select().from(assemblyBatches)).toEqual([]);
  });

  it("answers an output a product sold by the unit cannot hold as invalid", async () => {
    const { headers, userId, locationId } = await batchMaker();
    const ids = await mixWithStock(userId, locationId);
    const unitsMix = await insertProduct(db, { name: "Caja", saleUnit: "UNIT" });
    await saveRecipe(new DrizzleRecipeStore(db, () => NOW), {
      productId: unitsMix.productId,
      components: [{ componentProductId: ids.nuts, quantityPerOutputUnit: 1_000 }],
      version: null,
      actorId: userId,
    });

    const response = await post(headers, {
      productId: unitsMix.productId,
      recipeVersion: 1,
      used: [{ componentProductId: ids.nuts, quantity: 1_000 }],
      output: 1_500,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "invalid_output" });
  });
});
