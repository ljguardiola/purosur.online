import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { stockBalances, stockMovements } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { registerStockMovementsRoutes } from "./stock-movements-route.js";
import {
  BACKOFFICE_ORIGIN,
  insertBalance,
  insertLocation,
  insertMovement,
  insertProduct,
  signedInWith,
} from "./test-support/stock-route-fixtures.js";

const NOW = new Date("2026-09-16T15:50:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

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
  registerStockMovementsRoutes(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOW });
});

afterEach(async () => {
  await app.close();
});

function post(url: string, headers: Record<string, string>, payload: Record<string, unknown>) {
  return app.inject({ method: "POST", url, headers, payload });
}

describe("POST /stock/losses", () => {
  it("returns 401 when no session cookie was sent", async () => {
    const response = await post("/stock/losses", { origin: BACKOFFICE_ORIGIN }, {});

    expect(response.statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const { headers } = await signedInWith(db, ["record_stock_losses"], NOW);

    const response = await post(
      "/stock/losses",
      { ...headers, origin: "https://attacker.example" },
      {},
    );

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a user who may adjust stock but not record losses", async () => {
    const { headers } = await signedInWith(db, ["adjust_stock", "perform_stock_counts"], NOW);

    const response = await post("/stock/losses", headers, {});

    expect(response.statusCode).toBe(403);
  });

  it("reaches the body validator, answering a validation failure on the named field", async () => {
    const { headers } = await signedInWith(db, ["record_stock_losses"], NOW);
    const { productId } = await insertProduct(db);

    const response = await post("/stock/losses", headers, {
      productId,
      reason: "supplier_return",
      quantity: 1000,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "reason" }],
    });
  });

  it("subtracts the loss from the balance of the user's branch, answering the new balance", async () => {
    const { headers, locationId, userId } = await signedInWith(db, ["record_stock_losses"], NOW);
    const { productId } = await insertProduct(db);
    await insertBalance(db, { productId, locationId, quantity: 24_000 });

    const response = await post("/stock/losses", headers, {
      productId,
      reason: "broken_or_spilled",
      quantity: 1000,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ balance: 23_000, superseded: false });
    const [movement] = await db.select().from(stockMovements);
    expect(movement).toMatchObject({
      productId,
      locationId,
      kind: "loss",
      reason: "broken_or_spilled",
      delta: -1000,
      occurredAt: NOW,
      actorId: userId,
    });
  });

  it("answers 404 for a deactivated product", async () => {
    const { headers } = await signedInWith(db, ["record_stock_losses"], NOW);
    const { productId } = await insertProduct(db, { active: false });

    const response = await post("/stock/losses", headers, {
      productId,
      reason: "theft",
      quantity: 1000,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
  });

  it("refuses part of a unit of a product sold by the unit on the quantity", async () => {
    const { headers } = await signedInWith(db, ["record_stock_losses"], NOW);
    const { productId } = await insertProduct(db, { saleUnit: "UNIT" });

    const response = await post("/stock/losses", headers, {
      productId,
      reason: "theft",
      quantity: 500,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "quantity" }],
    });
  });
});

describe("POST /stock/adjustments", () => {
  it("rejects a user who may record losses but not adjust stock", async () => {
    const { headers } = await signedInWith(db, ["record_stock_losses", "view_stock_balances"], NOW);

    const response = await post("/stock/adjustments", headers, {});

    expect(response.statusCode).toBe(403);
  });

  it("refuses adding stock returned to a supplier, on the direction", async () => {
    const { headers } = await signedInWith(db, ["adjust_stock"], NOW);
    const { productId } = await insertProduct(db);

    const response = await post("/stock/adjustments", headers, {
      productId,
      reason: "supplier_return",
      direction: "add",
      quantity: 1000,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "direction" }],
    });
  });

  it("adds an adjustment to the balance of the user's branch, answering the new balance", async () => {
    const { headers, locationId } = await signedInWith(db, ["adjust_stock"], NOW);
    const { productId } = await insertProduct(db);
    await insertBalance(db, { productId, locationId, quantity: 19_000 });

    const response = await post("/stock/adjustments", headers, {
      productId,
      reason: "purchase_correction",
      direction: "add",
      quantity: 12_000,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ balance: 31_000, superseded: false });
    const [balance] = await db.select().from(stockBalances);
    expect(balance?.quantity).toBe(31_000);
  });

  it("answers 404 for an unknown product", async () => {
    const { headers } = await signedInWith(db, ["adjust_stock"], NOW);

    const response = await post("/stock/adjustments", headers, {
      productId: "00000000-0000-4000-8000-000000000000",
      reason: "batch_correction",
      direction: "subtract",
      quantity: 1000,
    });

    expect(response.statusCode).toBe(404);
  });

  it("refuses part of a unit of a product sold by the unit on the quantity", async () => {
    const { headers } = await signedInWith(db, ["adjust_stock"], NOW);
    const { productId } = await insertProduct(db, { saleUnit: "UNIT" });

    const response = await post("/stock/adjustments", headers, {
      productId,
      reason: "batch_correction",
      direction: "subtract",
      quantity: 1500,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ details: [{ field: "quantity" }] });
  });
});

function listMovements(headers: Record<string, string>, query = "") {
  return app.inject({ method: "GET", url: `/stock/movements${query}`, headers });
}

async function seedLossAndAdjustment(locationId: string, actorId: string) {
  const otherLocationId = await insertLocation(db);
  const honey = await insertProduct(db);
  const peanut = await insertProduct(db, { name: "Pasta de maní 380 g" });
  const loss = await insertMovement(db, {
    productId: honey.productId,
    locationId,
    actorId,
    kind: "loss",
    reason: "broken_or_spilled",
    delta: -1000,
    occurredAt: new Date(NOW.getTime() - DAY),
  });
  const laterCount = await insertMovement(db, {
    productId: peanut.productId,
    locationId,
    actorId,
    kind: "count",
    delta: 0,
    occurredAt: new Date(NOW.getTime() - DAY),
  });
  const adjustment = await insertMovement(db, {
    productId: peanut.productId,
    locationId,
    actorId,
    kind: "adjustment",
    reason: "purchase_correction",
    delta: 12_000,
    occurredAt: new Date(NOW.getTime() - 2 * DAY),
    supersededByCountId: laterCount,
  });
  await insertMovement(db, {
    productId: honey.productId,
    locationId,
    actorId,
    kind: "count",
    delta: -500,
    occurredAt: new Date(NOW.getTime() - DAY),
  });
  await insertMovement(db, {
    productId: honey.productId,
    locationId: otherLocationId,
    actorId,
    kind: "loss",
    reason: "theft",
    delta: -1000,
    occurredAt: new Date(NOW.getTime() - DAY),
  });
  await insertMovement(db, {
    productId: honey.productId,
    locationId,
    actorId,
    kind: "loss",
    reason: "theft",
    delta: -1000,
    occurredAt: new Date(NOW.getTime() - 40 * DAY),
  });
  return { honey, peanut, loss, adjustment };
}

describe("GET /stock/movements", () => {
  it("returns 401 when no session cookie was sent", async () => {
    const response = await listMovements({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
  });

  it("rejects a user who may neither adjust stock nor record losses", async () => {
    const { headers } = await signedInWith(
      db,
      ["view_stock_balances", "perform_stock_counts"],
      NOW,
    );

    const response = await listMovements(headers);

    expect(response.statusCode).toBe(403);
  });

  it("lists the branch's losses and adjustments of the last 30 days, newest first", async () => {
    const { headers, locationId, userId } = await signedInWith(
      db,
      ["adjust_stock", "record_stock_losses"],
      NOW,
    );
    const { honey, peanut, loss, adjustment } = await seedLossAndAdjustment(locationId, userId);

    const response = await listMovements(headers);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      movements: [
        {
          id: loss,
          productId: honey.productId,
          productName: "Miel pura de abeja 1 kg",
          categoryName: "Almacén",
          saleUnit: "UNIT",
          kind: "loss",
          reason: "broken_or_spilled",
          delta: -1000,
          occurredAt: new Date(NOW.getTime() - DAY).toISOString(),
          superseded: false,
        },
        {
          id: adjustment,
          productId: peanut.productId,
          productName: "Pasta de maní 380 g",
          categoryName: "Almacén",
          saleUnit: "UNIT",
          kind: "adjustment",
          reason: "purchase_correction",
          delta: 12_000,
          occurredAt: new Date(NOW.getTime() - 2 * DAY).toISOString(),
          superseded: true,
        },
      ],
    });
  });

  it("lists the period the query asks for", async () => {
    const { headers, locationId, userId } = await signedInWith(db, ["record_stock_losses"], NOW);
    await seedLossAndAdjustment(locationId, userId);

    const response = await listMovements(headers, "?days=90");

    expect(response.json().movements).toHaveLength(2);
  });

  it.each([
    ["record_stock_losses", "loss"],
    ["adjust_stock", "adjustment"],
  ] as const)("shows a user holding only %s only its %s movements", async (permission, kind) => {
    const { headers, locationId, userId } = await signedInWith(db, [permission], NOW);
    await seedLossAndAdjustment(locationId, userId);

    const response = await listMovements(headers);

    const kinds = response.json().movements.map((movement: { kind: string }) => movement.kind);
    expect(kinds).toEqual([kind]);
  });

  it("shows an Administrator both kinds", async () => {
    const { headers, locationId, userId } = await signedInWith(db, [], NOW, {
      isAdministrator: true,
    });
    await seedLossAndAdjustment(locationId, userId);

    const response = await listMovements(headers);

    expect(response.json().movements).toHaveLength(2);
  });
});
