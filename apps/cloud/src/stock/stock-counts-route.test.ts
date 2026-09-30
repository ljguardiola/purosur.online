import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { stockBalances, stockCounts, stockMovements } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { registerStockCountsRoutes } from "./stock-counts-route.js";
import {
  BACKOFFICE_ORIGIN,
  insertBalance,
  insertLocation,
  insertMovement,
  insertProduct,
  signedInWith,
} from "./test-support/stock-route-fixtures.js";

const NOW = new Date("2026-09-16T15:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const COUNTED_AT = new Date("2026-09-15T21:32:00.000Z");
const AFTER_COUNT = new Date("2026-09-15T22:00:00.000Z");

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
  registerStockCountsRoutes(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOW });
});

afterEach(async () => {
  await app.close();
});

function registerCountRequest(headers: Record<string, string>, payload: Record<string, unknown>) {
  return app.inject({ method: "POST", url: "/inventory-counts", headers, payload });
}

describe("POST /inventory-counts", () => {
  it("returns 401 when no session cookie was sent", async () => {
    const response = await registerCountRequest({ origin: BACKOFFICE_ORIGIN }, {});

    expect(response.statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const { headers } = await signedInWith(db, ["perform_stock_counts"], NOW);

    const response = await registerCountRequest(
      { ...headers, origin: "https://attacker.example" },
      {},
    );

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a user without perform_stock_counts, even one who views balances", async () => {
    const { headers } = await signedInWith(
      db,
      ["view_stock_balances", "adjust_stock", "record_stock_losses"],
      NOW,
    );

    const response = await registerCountRequest(headers, {});

    expect(response.statusCode).toBe(403);
  });

  it("reaches the body validator, answering a validation failure on the named field", async () => {
    const { headers } = await signedInWith(db, ["perform_stock_counts"], NOW);
    const { productId } = await insertProduct(db);

    const response = await registerCountRequest(headers, {
      productId,
      counted: -1,
      occurredAt: COUNTED_AT.toISOString(),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "counted" }],
    });
  });

  it("registers the count in the user's branch and answers the resulting difference", async () => {
    const { headers, locationId, userId } = await signedInWith(db, ["perform_stock_counts"], NOW);
    const { productId } = await insertProduct(db, { saleUnit: "KG" });
    await insertBalance(db, { productId, locationId, quantity: 11_400 });
    await insertMovement(db, {
      productId,
      locationId,
      actorId: userId,
      kind: "loss",
      reason: "theft",
      delta: -1000,
      occurredAt: AFTER_COUNT,
    });

    const response = await registerCountRequest(headers, {
      productId,
      counted: 12_150,
      occurredAt: COUNTED_AT.toISOString(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      expected: 12_400,
      delta: -250,
      balance: 11_150,
      superseded: false,
    });
    const [balance] = await db.select().from(stockBalances);
    expect(balance).toEqual({ productId, locationId, quantity: 11_150 });
    const [count] = await db.select().from(stockCounts);
    expect(count).toMatchObject({ counted: 12_150, expected: 12_400 });
    const movements = await db
      .select({ actorId: stockMovements.actorId })
      .from(stockMovements)
      .where(eq(stockMovements.kind, "count"));
    expect(movements).toEqual([{ actorId: userId }]);
  });

  it("answers a count dated before an already registered count as superseded", async () => {
    const { headers, locationId, userId } = await signedInWith(db, ["perform_stock_counts"], NOW);
    const { productId } = await insertProduct(db);
    await insertBalance(db, { productId, locationId, quantity: 5000 });
    await insertMovement(db, {
      productId,
      locationId,
      actorId: userId,
      kind: "count",
      delta: 0,
      occurredAt: AFTER_COUNT,
      count: { counted: 5000, expected: 5000 },
    });

    const response = await registerCountRequest(headers, {
      productId,
      counted: 1000,
      occurredAt: COUNTED_AT.toISOString(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ balance: 5000, superseded: true });
  });

  it.each([
    ["an unknown product", async () => "00000000-0000-4000-8000-000000000000"],
    [
      "a deactivated product",
      async () => (await insertProduct(db, { name: "Arroz", active: false })).productId,
    ],
  ])("answers 404 for %s", async (_case, productOf) => {
    const { headers } = await signedInWith(db, ["perform_stock_counts"], NOW);

    const response = await registerCountRequest(headers, {
      productId: await productOf(),
      counted: 1000,
      occurredAt: COUNTED_AT.toISOString(),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
  });

  it("refuses part of a unit of a product sold by the unit on the counted quantity", async () => {
    const { headers } = await signedInWith(db, ["perform_stock_counts"], NOW);
    const { productId } = await insertProduct(db, { saleUnit: "UNIT" });

    const response = await registerCountRequest(headers, {
      productId,
      counted: 1500,
      occurredAt: COUNTED_AT.toISOString(),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "counted" }],
    });
  });

  it("refuses a count dated after now", async () => {
    const { headers } = await signedInWith(db, ["perform_stock_counts"], NOW);
    const { productId } = await insertProduct(db);

    const response = await registerCountRequest(headers, {
      productId,
      counted: 1000,
      occurredAt: new Date(NOW.getTime() + 60_000).toISOString(),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "occurred_in_the_future",
      details: [{ field: "occurredAt" }],
    });
  });

  it("refuses a count at the moment of another count of the product", async () => {
    const { headers, locationId, userId } = await signedInWith(db, ["perform_stock_counts"], NOW);
    const { productId } = await insertProduct(db);
    await insertMovement(db, {
      productId,
      locationId,
      actorId: userId,
      kind: "count",
      delta: 0,
      occurredAt: COUNTED_AT,
      count: { counted: 0, expected: 0 },
    });

    const response = await registerCountRequest(headers, {
      productId,
      counted: 1000,
      occurredAt: COUNTED_AT.toISOString(),
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: "count_at_same_moment",
      details: [{ field: "occurredAt" }],
    });
  });
});

function listCounts(headers: Record<string, string>, query = "") {
  return app.inject({ method: "GET", url: `/inventory-counts${query}`, headers });
}

describe("GET /inventory-counts", () => {
  it("returns 401 when no session cookie was sent", async () => {
    const response = await listCounts({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
  });

  it("rejects a user without perform_stock_counts", async () => {
    const { headers } = await signedInWith(db, ["view_stock_balances"], NOW);

    const response = await listCounts(headers);

    expect(response.statusCode).toBe(403);
  });

  it("lists the branch's counts of the last 30 days by default, newest first", async () => {
    const { headers, locationId, userId } = await signedInWith(db, ["perform_stock_counts"], NOW);
    const otherLocationId = await insertLocation(db);
    const almonds = await insertProduct(db, {
      name: "Almendras peladas",
      categoryName: "Frutos secos",
      saleUnit: "KG",
    });
    const honey = await insertProduct(db);
    const recent = await insertMovement(db, {
      productId: almonds.productId,
      locationId,
      actorId: userId,
      kind: "count",
      delta: -250,
      occurredAt: COUNTED_AT,
      count: { counted: 12_150, expected: 12_400 },
    });
    const older = await insertMovement(db, {
      productId: honey.productId,
      locationId,
      actorId: userId,
      kind: "count",
      delta: 0,
      occurredAt: new Date(NOW.getTime() - 29 * DAY),
      supersededByCountId: recent,
      count: { counted: 24_000, expected: 24_000 },
    });
    await insertMovement(db, {
      productId: honey.productId,
      locationId,
      actorId: userId,
      kind: "count",
      delta: 0,
      occurredAt: new Date(NOW.getTime() - 31 * DAY),
      count: { counted: 1000, expected: 1000 },
    });
    await insertMovement(db, {
      productId: honey.productId,
      locationId: otherLocationId,
      actorId: userId,
      kind: "count",
      delta: 0,
      occurredAt: COUNTED_AT,
      count: { counted: 1000, expected: 1000 },
    });
    await insertMovement(db, {
      productId: honey.productId,
      locationId,
      actorId: userId,
      kind: "loss",
      reason: "theft",
      delta: -1000,
      occurredAt: COUNTED_AT,
    });

    const response = await listCounts(headers);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      counts: [
        {
          id: recent,
          productId: almonds.productId,
          productName: "Almendras peladas",
          categoryId: almonds.categoryId,
          categoryName: "Frutos secos",
          saleUnit: "KG",
          occurredAt: COUNTED_AT.toISOString(),
          expected: 12_400,
          counted: 12_150,
          delta: -250,
          superseded: false,
        },
        {
          id: older,
          productId: honey.productId,
          productName: "Miel pura de abeja 1 kg",
          categoryId: honey.categoryId,
          categoryName: "Almacén",
          saleUnit: "UNIT",
          occurredAt: new Date(NOW.getTime() - 29 * DAY).toISOString(),
          expected: 24_000,
          counted: 24_000,
          delta: 0,
          superseded: true,
        },
      ],
    });
  });

  it.each([
    ["?days=7", 1],
    ["?days=90", 2],
    ["?days=12", 1],
  ])("lists the counts of the period %s asks for", async (query, expectedCount) => {
    const { headers, locationId, userId } = await signedInWith(db, ["perform_stock_counts"], NOW);
    const { productId } = await insertProduct(db);
    for (const daysAgo of [1, 60]) {
      await insertMovement(db, {
        productId,
        locationId,
        actorId: userId,
        kind: "count",
        delta: 0,
        occurredAt: new Date(NOW.getTime() - daysAgo * DAY),
        count: { counted: 0, expected: 0 },
      });
    }

    const response = await listCounts(headers, query);

    expect(response.json().counts).toHaveLength(expectedCount);
  });
});

function expectedBalanceRequest(headers: Record<string, string>, productId: string, at: string) {
  return app.inject({
    method: "GET",
    url: `/inventory-levels/${productId}?at=${encodeURIComponent(at)}`,
    headers,
  });
}

describe("GET /inventory-levels/:productId", () => {
  it("rejects a user who may count but not view balances", async () => {
    const { headers } = await signedInWith(db, ["perform_stock_counts"], NOW);
    const { productId } = await insertProduct(db);

    const response = await expectedBalanceRequest(headers, productId, COUNTED_AT.toISOString());

    expect(response.statusCode).toBe(403);
  });

  it("answers the balance left after undoing what the branch applied after the moment", async () => {
    const { headers, locationId, userId } = await signedInWith(db, ["view_stock_balances"], NOW);
    const otherLocationId = await insertLocation(db);
    const { productId, categoryId } = await insertProduct(db, {
      name: "Almendras peladas",
      categoryName: "Frutos secos",
      saleUnit: "KG",
    });
    await insertBalance(db, { productId, locationId, quantity: 16_000 });
    await insertMovement(db, {
      productId,
      locationId,
      actorId: userId,
      kind: "loss",
      reason: "theft",
      delta: -1000,
      occurredAt: AFTER_COUNT,
    });
    await insertMovement(db, {
      productId,
      locationId: otherLocationId,
      actorId: userId,
      kind: "loss",
      reason: "theft",
      delta: -3000,
      occurredAt: AFTER_COUNT,
    });

    const response = await expectedBalanceRequest(headers, productId, COUNTED_AT.toISOString());

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: productId,
      name: "Almendras peladas",
      categoryId,
      categoryName: "Frutos secos",
      saleUnit: "KG",
      balance: 17_000,
    });
  });

  it("answers zero for a product with no movement in the branch", async () => {
    const { headers } = await signedInWith(db, ["view_stock_balances"], NOW);
    const { productId } = await insertProduct(db);

    const response = await expectedBalanceRequest(headers, productId, COUNTED_AT.toISOString());

    expect(response.json()).toMatchObject({ balance: 0 });
  });

  it.each(["not-a-uuid", "00000000-0000-4000-8000-000000000000"])(
    "answers 404 for the product id %s",
    async (productId) => {
      const { headers } = await signedInWith(db, ["view_stock_balances"], NOW);

      const response = await expectedBalanceRequest(headers, productId, COUNTED_AT.toISOString());

      expect(response.statusCode).toBe(404);
    },
  );

  it("answers 404 for a deactivated product", async () => {
    const { headers } = await signedInWith(db, ["view_stock_balances"], NOW);
    const { productId } = await insertProduct(db, { active: false });

    const response = await expectedBalanceRequest(headers, productId, COUNTED_AT.toISOString());

    expect(response.statusCode).toBe(404);
  });

  it.each(["", "yesterday", "2026-09-15"])("refuses the moment %j", async (at) => {
    const { headers } = await signedInWith(db, ["view_stock_balances"], NOW);
    const { productId } = await insertProduct(db);

    const response = await expectedBalanceRequest(headers, productId, at);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "at" }],
    });
  });
});

describe("the former stock paths", () => {
  it.each([
    ["POST", "/stock/counts"],
    ["GET", "/stock/counts"],
    [
      "GET",
      `/stock/products/00000000-0000-4000-8000-000000000000/expected-balance?at=${COUNTED_AT.toISOString()}`,
    ],
  ] as const)("no longer answers %s %s", async (method, url) => {
    const { headers } = await signedInWith(db, ["perform_stock_counts"], NOW);

    const response = await app.inject({ method, url, headers });

    expect(response.statusCode).toBe(404);
  });
});
