import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { registerStockBalancesRoute } from "./stock-balances-route.js";
import { insertPurchasedLot, insertTechnicalLot } from "./test-support/lot-fixtures.js";
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

  it("lists the products with their balance in the user's branch", async () => {
    const { headers, locationId } = await signedInWith(db, ["view_stock_balances"], NOON);
    const otherLocationId = await insertLocation(db);
    const almonds = await insertProduct(db, {
      name: "Almendras peladas",
      categoryName: "Frutos secos",
      saleUnit: "KG",
    });
    await insertBalance(db, { productId: almonds.productId, locationId, quantity: 12_150 });
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
          balance: 12_150,
        },
      ],
    });
  });
});

function listLots(productId: string, headers: Record<string, string>) {
  return app.inject({ method: "GET", url: `/inventory-levels/${productId}/lots`, headers });
}

describe("GET /inventory-levels/:productId/lots", () => {
  it("returns 401 when no session cookie was sent", async () => {
    const { productId } = await insertProduct(db);

    const response = await listLots(productId, { origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
  });

  it("rejects a user holding no stock balances permission", async () => {
    const { headers } = await signedInWith(db, ["adjust_stock"], NOON);
    const { productId } = await insertProduct(db);

    const response = await listLots(productId, headers);

    expect(response.statusCode).toBe(403);
  });

  it("answers 404 for a product that does not exist", async () => {
    const { headers } = await signedInWith(db, ["view_stock_balances"], NOON);

    const response = await listLots("00000000-0000-4000-8000-000000000000", headers);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
  });

  it("answers 400 for an id that is not a record id", async () => {
    const { headers } = await signedInWith(db, ["view_stock_balances"], NOON);

    const response = await listLots("not-an-id", headers);

    expect(response.statusCode).toBe(400);
  });

  it("answers no lots for a product without any", async () => {
    const { headers } = await signedInWith(db, ["view_stock_balances"], NOON);
    const { productId } = await insertProduct(db);

    const response = await listLots(productId, headers);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ lots: [] });
  });

  it("lists the lots of the user's branch, valued, with the technical one unvalued", async () => {
    const { headers, locationId, userId } = await signedInWith(db, ["view_stock_balances"], NOON);
    const otherLocationId = await insertLocation(db);
    const { productId } = await insertProduct(db);
    const lotId = await insertPurchasedLot(db, {
      productId,
      locationId,
      actorId: userId,
      expiresOn: "2027-03-01",
      lotNumber: "L-77",
      remaining: 4_000,
    });
    const technicalId = await insertTechnicalLot(db, { productId, locationId, remaining: -2_000 });
    await insertPurchasedLot(db, { productId, locationId: otherLocationId, actorId: userId });

    const response = await listLots(productId, headers);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      lots: [
        {
          id: lotId,
          lotNumber: "L-77",
          expiresOn: "2027-03-01",
          purchasedOn: "2026-10-01",
          technical: false,
          remaining: 4_000,
          valueCents: 20_000,
          costIncomplete: false,
        },
        {
          id: technicalId,
          lotNumber: null,
          expiresOn: null,
          purchasedOn: null,
          technical: true,
          remaining: -2_000,
          valueCents: null,
          costIncomplete: true,
        },
      ],
    });
  });
});
