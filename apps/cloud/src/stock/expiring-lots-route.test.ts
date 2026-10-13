import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { branchSettings, stockMovements } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { registerExpiringLotsRoutes } from "./expiring-lots-route.js";
import { insertPurchasedLot } from "./test-support/lot-fixtures.js";
import {
  BACKOFFICE_ORIGIN,
  insertBalance,
  insertLocation,
  insertProduct,
  signedInWith,
} from "./test-support/stock-route-fixtures.js";

const NOW = new Date("2026-10-13T15:00:00.000Z");
const UNKNOWN_LOT_ID = "00000000-0000-4000-8000-000000000000";

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
  registerExpiringLotsRoutes(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOW });
});

afterEach(async () => {
  await app.close();
});

function listLots(headers: Record<string, string>) {
  return app.inject({ method: "GET", url: "/expiring-lots", headers });
}

function discard(lotId: string, headers: Record<string, string>) {
  return app.inject({ method: "POST", url: `/expiring-lots/${lotId}/discard`, headers });
}

describe("GET /expiring-lots", () => {
  it("returns 401 when no session cookie was sent", async () => {
    expect((await listLots({ origin: BACKOFFICE_ORIGIN })).statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const { headers } = await signedInWith(db, ["manage_expiration_dates"], NOW);

    const response = await listLots({ ...headers, origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it.each(["view_stock_balances", "record_stock_losses", "adjust_stock"] as const)(
    "rejects a user holding %s but not manage_expiration_dates",
    async (permission) => {
      const { headers } = await signedInWith(db, [permission], NOW);

      expect((await listLots(headers)).statusCode).toBe(403);
    },
  );

  it("lists the lots of the user's branch within the window its branch settings configure", async () => {
    const { headers, locationId, userId } = await signedInWith(
      db,
      ["manage_expiration_dates"],
      NOW,
    );
    await db
      .update(branchSettings)
      .set({ expiringLotAlertDays: 45 })
      .where(eq(branchSettings.locationId, locationId));
    const otherLocationId = await insertLocation(db);
    const cheese = await insertProduct(db, {
      name: "Queso cremoso",
      categoryName: "Lácteos",
      saleUnit: "KG",
    });
    const own = await insertPurchasedLot(db, {
      productId: cheese.productId,
      locationId,
      actorId: userId,
      expiresOn: "2026-10-10",
      lotNumber: "L-77",
      remaining: 4_000,
    });
    await insertPurchasedLot(db, {
      productId: cheese.productId,
      locationId: otherLocationId,
      actorId: userId,
      expiresOn: "2026-10-11",
    });

    const response = await listLots(headers);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      windowDays: 45,
      lots: [
        {
          id: own,
          lotNumber: "L-77",
          expiresOn: "2026-10-10",
          remaining: 4_000,
          valueCents: 20_000,
          expired: true,
          daysToExpiry: -3,
          product: {
            id: cheese.productId,
            name: "Queso cremoso",
            categoryId: cheese.categoryId,
            categoryName: "Lácteos",
            saleUnit: "KG",
          },
        },
      ],
      summary: { valueCents: 20_000, withoutCostCount: 0 },
    });
  });
});

describe("POST /expiring-lots/:lotId/discard", () => {
  it("returns 401 when no session cookie was sent", async () => {
    expect((await discard(UNKNOWN_LOT_ID, { origin: BACKOFFICE_ORIGIN })).statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const { headers } = await signedInWith(db, ["manage_expiration_dates"], NOW);

    const response = await discard(UNKNOWN_LOT_ID, {
      ...headers,
      origin: "https://attacker.example",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a user who may record losses but not manage expiration dates, whatever the lot", async () => {
    const { headers } = await signedInWith(db, ["record_stock_losses", "adjust_stock"], NOW);

    expect((await discard(UNKNOWN_LOT_ID, headers)).statusCode).toBe(403);
  });

  it("refuses a lot id that is not an id", async () => {
    const { headers } = await signedInWith(db, ["manage_expiration_dates"], NOW);

    const response = await discard("not-a-lot", headers);

    expect(response.statusCode).toBe(400);
  });

  it("discards the lot as a loss for expiry, answering the movement and the balance left", async () => {
    const { headers, locationId, userId } = await signedInWith(
      db,
      ["manage_expiration_dates"],
      NOW,
    );
    const { productId } = await insertProduct(db);
    await insertBalance(db, { productId, locationId, quantity: 10_000 });
    const lotId = await insertPurchasedLot(db, {
      productId,
      locationId,
      actorId: userId,
      expiresOn: "2026-10-10",
      remaining: 4_000,
    });

    const response = await discard(lotId, headers);

    expect(response.statusCode).toBe(200);
    const [movement] = await db.select().from(stockMovements);
    expect(response.json()).toEqual({
      movementId: movement?.id,
      quantity: 4_000,
      balance: 6_000,
      superseded: false,
    });
    expect(movement).toMatchObject({
      productId,
      locationId,
      kind: "loss",
      reason: "expired",
      delta: -4_000,
      occurredAt: NOW,
      actorId: userId,
    });
  });

  it("answers 404 for a lot that does not exist", async () => {
    const { headers } = await signedInWith(db, ["manage_expiration_dates"], NOW);

    const response = await discard(UNKNOWN_LOT_ID, headers);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
  });

  it("answers 404 for a lot of another branch", async () => {
    const { headers, userId } = await signedInWith(db, ["manage_expiration_dates"], NOW);
    const otherLocationId = await insertLocation(db);
    const { productId } = await insertProduct(db);
    const lotId = await insertPurchasedLot(db, {
      productId,
      locationId: otherLocationId,
      actorId: userId,
      expiresOn: "2026-10-10",
    });

    expect((await discard(lotId, headers)).statusCode).toBe(404);
  });

  it("answers 409 lot_not_expired for a lot that has not expired yet", async () => {
    const { headers, locationId, userId } = await signedInWith(
      db,
      ["manage_expiration_dates"],
      NOW,
    );
    const { productId } = await insertProduct(db);
    const lotId = await insertPurchasedLot(db, {
      productId,
      locationId,
      actorId: userId,
      expiresOn: "2026-10-13",
      remaining: 4_000,
    });

    const response = await discard(lotId, headers);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "lot_not_expired" });
  });

  it("answers 409 lot_empty for an expired lot with nothing left", async () => {
    const { headers, locationId, userId } = await signedInWith(
      db,
      ["manage_expiration_dates"],
      NOW,
    );
    const { productId } = await insertProduct(db);
    const lotId = await insertPurchasedLot(db, {
      productId,
      locationId,
      actorId: userId,
      expiresOn: "2026-10-10",
      remaining: 0,
    });

    const response = await discard(lotId, headers);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "lot_empty" });
  });
});
