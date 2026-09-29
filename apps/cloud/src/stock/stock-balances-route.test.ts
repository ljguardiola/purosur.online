import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { registerStockBalancesRoute } from "./stock-balances-route.js";
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
  return app.inject({ method: "GET", url: "/stock/balances", headers });
}

describe("GET /stock/balances", () => {
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

  it("lists every active product with its balance in the user's branch, by name", async () => {
    const { headers, locationId } = await signedInWith(db, ["view_stock_balances"], NOON);
    const otherLocationId = await insertLocation(db);
    const almonds = await insertProduct(db, {
      name: "Almendras peladas",
      categoryName: "Frutos secos",
      saleUnit: "KG",
    });
    const crackers = await insertProduct(db, { name: "Galletas de arroz integrales" });
    const honey = await insertProduct(db, { name: "Miel pura de abeja 1 kg" });
    await insertProduct(db, { name: "Arroz discontinuado", active: false });
    await insertBalance(db, { productId: almonds.productId, locationId, quantity: 12_150 });
    await insertBalance(db, { productId: crackers.productId, locationId, quantity: -4000 });
    await insertBalance(db, {
      productId: honey.productId,
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
          balance: 12_150,
        },
        {
          id: crackers.productId,
          name: "Galletas de arroz integrales",
          categoryId: crackers.categoryId,
          categoryName: "Almacén",
          saleUnit: "UNIT",
          balance: -4000,
        },
        {
          id: honey.productId,
          name: "Miel pura de abeja 1 kg",
          categoryId: honey.categoryId,
          categoryName: "Almacén",
          saleUnit: "UNIT",
          balance: 0,
        },
      ],
    });
  });
});
