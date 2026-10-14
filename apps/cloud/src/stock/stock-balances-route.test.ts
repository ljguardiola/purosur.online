import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { registerStockBalancesRoute } from "./stock-balances-route.js";
import { insertAssemblyBatch } from "./test-support/assembly-batch-fixtures.js";
import { insertPurchasedLot } from "./test-support/lot-fixtures.js";
import {
  BACKOFFICE_ORIGIN,
  insertBalance,
  insertLocation,
  insertProduct,
  signedInWith,
} from "./test-support/stock-route-fixtures.js";

const NOON = new Date("2026-09-16T15:00:00.000Z");

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
  registerStockBalancesRoute(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOON });
});

afterEach(async () => {
  await app.close();
});

function listBalances(headers: Record<string, string>) {
  return app.inject({ method: "GET", url: "/inventory-levels", headers });
}

describe("GET /inventory-levels", () => {
  it("returns 401 when no session cookie was sent", async () => {
    const response = await listBalances({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const { headers } = await signedInWith(db, ["view_stock_balances"], NOON);

    const response = await listBalances({ ...headers, origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a user holding no stock permission", async () => {
    const { headers } = await signedInWith(db, ["manage_prices_and_review"], NOON);

    const response = await listBalances(headers);

    expect(response.statusCode).toBe(403);
  });

  it("answers a user holding view_stock_balances", async () => {
    const { headers } = await signedInWith(db, ["view_stock_balances"], NOON);

    const response = await listBalances(headers);

    expect(response.statusCode).toBe(200);
  });

  it.each(["record_stock_losses", "adjust_stock", "perform_stock_counts"] as const)(
    "rejects a user holding %s but not view_stock_balances",
    async (permission) => {
      const { headers } = await signedInWith(db, [permission], NOON);

      const response = await listBalances(headers);

      expect(response.statusCode).toBe(403);
    },
  );

  it("lists the products of the user's branch with their lots and the footer", async () => {
    const { headers, locationId, userId } = await signedInWith(db, ["view_stock_balances"], NOON);
    const otherLocationId = await insertLocation(db);
    const almonds = await insertProduct(db, {
      name: "Almendras peladas",
      categoryName: "Frutos secos",
      saleUnit: "KG",
    });
    const lotId = await insertPurchasedLot(db, {
      productId: almonds.productId,
      locationId,
      actorId: userId,
      supplierName: "Distribuidora Sur",
      purchasedOn: "2026-10-01",
      expiresOn: "2027-03-01",
      lotNumber: "L-77",
      remaining: 4_000,
    });
    await insertBalance(db, { productId: almonds.productId, locationId, quantity: 4_000 });
    await insertBalance(db, {
      productId: almonds.productId,
      locationId: otherLocationId,
      quantity: 23_000,
    });

    const response = await listBalances(headers);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      products: [
        {
          id: almonds.productId,
          name: "Almendras peladas",
          categoryId: almonds.categoryId,
          categoryName: "Frutos secos",
          saleUnit: "KG",
          active: true,
          balance: 4_000,
          valueCents: 20_000,
          unitCostCents: 5_000,
          lotCount: 1,
          correction: null,
          lots: [
            {
              id: lotId,
              lotNumber: "L-77",
              expiresOn: "2027-03-01",
              technical: false,
              remaining: 4_000,
              valueCents: 20_000,
              unitCostCents: 5_000,
              origin: {
                kind: "purchase",
                purchasedOn: "2026-10-01",
                supplierName: "Distribuidora Sur",
              },
            },
          ],
        },
      ],
      summary: { productCount: 1, valueCents: 20_000, withoutCostCount: 0 },
    });
  });

  it("answers the lot of an assembled batch with the moment it was assembled in ISO form", async () => {
    const { headers, locationId, userId } = await signedInWith(db, ["view_stock_balances"], NOON);
    const mix = await insertProduct(db, { name: "Mix", saleUnit: "KG" });
    await insertAssemblyBatch(db, {
      productId: mix.productId,
      locationId,
      actorId: userId,
      assembledAt: new Date("2026-05-04T13:00:00.000Z"),
    });
    await insertBalance(db, { productId: mix.productId, locationId, quantity: 14_000 });

    const response = await listBalances(headers);

    expect(response.statusCode).toBe(200);
    expect(response.json().products[0].lots[0]).toMatchObject({
      technical: false,
      origin: { kind: "assembly_batch", assembledAt: "2026-05-04T13:00:00.000Z" },
    });
  });
});
