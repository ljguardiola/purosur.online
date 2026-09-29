import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { registerStockProductsRoute } from "./stock-products-route.js";
import {
  BACKOFFICE_ORIGIN,
  insertBalance,
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
  registerStockProductsRoute(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOON });
});

afterEach(async () => {
  await app.close();
});

function listProducts(headers: Record<string, string>) {
  return app.inject({ method: "GET", url: "/stock/products", headers });
}

describe("GET /stock/products", () => {
  it("returns 401 when no session cookie was sent", async () => {
    const response = await listProducts({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const { headers } = await signedInWith(db, ["record_stock_losses"], NOON);

    const response = await listProducts({ ...headers, origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
  });

  it("rejects a user holding no stock permission", async () => {
    const { headers } = await signedInWith(db, ["manage_prices_and_review"], NOON);

    const response = await listProducts(headers);

    expect(response.statusCode).toBe(403);
  });

  it.each([
    "view_stock_balances",
    "perform_stock_counts",
    "adjust_stock",
    "record_stock_losses",
  ] as const)("answers a user holding %s", async (permission) => {
    const { headers } = await signedInWith(db, [permission], NOON);

    const response = await listProducts(headers);

    expect(response.statusCode).toBe(200);
  });

  it("lists every active product by name, without its balance", async () => {
    const { headers, locationId } = await signedInWith(db, ["record_stock_losses"], NOON);
    const honey = await insertProduct(db, { name: "Miel pura de abeja 1 kg" });
    const almonds = await insertProduct(db, {
      name: "Almendras peladas",
      categoryName: "Frutos secos",
      saleUnit: "KG",
    });
    await insertProduct(db, { name: "Arroz discontinuado", active: false });
    await insertBalance(db, { productId: honey.productId, locationId, quantity: 24_000 });

    const response = await listProducts(headers);

    expect(response.json()).toEqual({
      products: [
        {
          id: almonds.productId,
          name: "Almendras peladas",
          categoryId: almonds.categoryId,
          categoryName: "Frutos secos",
          saleUnit: "KG",
        },
        {
          id: honey.productId,
          name: "Miel pura de abeja 1 kg",
          categoryId: honey.categoryId,
          categoryName: "Almacén",
          saleUnit: "UNIT",
        },
      ],
    });
  });
});
