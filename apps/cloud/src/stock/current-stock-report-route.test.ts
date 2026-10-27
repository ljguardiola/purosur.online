import { canonicalOutboxEvent } from "@purosur/domain";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { lots, users } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { applySyncedEventsTask } from "../sync/apply-synced-events-task.js";
import { hmacEventChain } from "../sync/hmac-event-chain.js";
import { NOW as EVENTS_NOW, eventsRouteUnderTest } from "../sync/test-support/events-route.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { registerCurrentStockReportRoute } from "./current-stock-report-route.js";
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
  registerCurrentStockReportRoute(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    zoneRules: fixedZoneRulesSource(),
    now: () => NOON,
  });
});

afterEach(async () => {
  await app.close();
});

function currentStock(headers: Record<string, string>, query = "") {
  return app.inject({ method: "GET", url: `/reports/current-stock${query}`, headers });
}

describe("GET /reports/current-stock access", () => {
  it("returns 401 when no session cookie was sent", async () => {
    const response = await currentStock({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOON);

    const response = await currentStock({ ...headers, origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it.each(["view_stock_balances", "perform_stock_counts"] as const)(
    "rejects a user holding %s but not view_reports",
    async (permission) => {
      const { headers } = await signedInWith(db, [permission], NOON);

      const response = await currentStock(headers);

      expect(response.statusCode).toBe(403);
    },
  );

  it("answers a user who may view reports", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOON);

    const response = await currentStock(headers);

    expect(response.statusCode).toBe(200);
  });

  it("answers 400 to a category that is not an id", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOON);

    const response = await currentStock(headers, "?category_id=almacen");

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });
});

describe("GET /reports/current-stock", () => {
  it("answers an empty report when the branch holds no stock", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOON);

    const response = await currentStock(headers);

    expect(response.json()).toEqual({
      products: [],
      categories: [],
      summary: {
        value_cents: 0,
        product_count: 0,
        negative_balance_count: 0,
        without_cost_count: 0,
      },
    });
  });

  it("values each lot at its own cost and the product as the sum of its lots", async () => {
    const { headers, locationId, userId } = await signedInWith(db, ["view_reports"], NOON);
    const almonds = await insertProduct(db, {
      name: "Almendras peladas",
      categoryName: "Frutos secos",
      saleUnit: "KG",
    });
    const cheaperLot = await insertPurchasedLot(db, {
      productId: almonds.productId,
      locationId,
      actorId: userId,
      expiresOn: "2027-03-01",
      lotNumber: "L-77",
      remaining: 4_000,
    });
    const dearerLot = await insertPurchasedLot(db, {
      productId: almonds.productId,
      locationId,
      actorId: userId,
      expiresOn: "2027-06-01",
      lotNumber: "L-80",
      remaining: 2_000,
    });
    await db.update(lots).set({ costTotalCents: 6_000 }).where(eq(lots.id, dearerLot));
    await insertBalance(db, { productId: almonds.productId, locationId, quantity: 6_000 });

    const response = await currentStock(headers);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      products: [
        {
          id: almonds.productId,
          name: "Almendras peladas",
          category_id: almonds.categoryId,
          category_name: "Frutos secos",
          sale_unit: "KG",
          balance: 6_000,
          value_cents: 32_000,
          lots: [
            {
              id: cheaperLot,
              lot_number: "L-77",
              expires_on: "2027-03-01",
              technical: false,
              remaining: 4_000,
              unit_cost_cents: 5_000,
              value_cents: 20_000,
            },
            {
              id: dearerLot,
              lot_number: "L-80",
              expires_on: "2027-06-01",
              technical: false,
              remaining: 2_000,
              unit_cost_cents: 6_000,
              value_cents: 12_000,
            },
          ],
        },
      ],
      categories: [{ id: almonds.categoryId, name: "Frutos secos" }],
      summary: {
        value_cents: 32_000,
        product_count: 1,
        negative_balance_count: 0,
        without_cost_count: 0,
      },
    });
  });

  it("reports only the stock of the user's branch", async () => {
    const { headers, locationId, userId } = await signedInWith(db, ["view_reports"], NOON);
    const otherLocationId = await insertLocation(db);
    const here = await insertProduct(db, { name: "Harina", saleUnit: "KG" });
    const elsewhere = await insertProduct(db, { name: "Azúcar", saleUnit: "KG" });
    await insertPurchasedLot(db, {
      productId: here.productId,
      locationId,
      actorId: userId,
      remaining: 4_000,
    });
    await insertBalance(db, { productId: here.productId, locationId, quantity: 4_000 });
    await insertPurchasedLot(db, {
      productId: here.productId,
      locationId: otherLocationId,
      actorId: userId,
      remaining: 9_000,
    });
    await insertBalance(db, {
      productId: here.productId,
      locationId: otherLocationId,
      quantity: 9_000,
    });
    await insertPurchasedLot(db, {
      productId: elsewhere.productId,
      locationId: otherLocationId,
      actorId: userId,
      remaining: 3_000,
    });
    await insertBalance(db, {
      productId: elsewhere.productId,
      locationId: otherLocationId,
      quantity: 3_000,
    });

    const body = (await currentStock(headers)).json();

    expect(body.products).toEqual([
      expect.objectContaining({ id: here.productId, balance: 4_000, value_cents: 20_000 }),
    ]);
    expect(body.summary).toMatchObject({ product_count: 1, value_cents: 20_000 });
  });

  it("reports an inactive product with a zero balance that still has lots in stock", async () => {
    const { headers, locationId, userId } = await signedInWith(db, ["view_reports"], NOON);
    const oats = await insertProduct(db, { name: "Avena", active: false });
    for (const remaining of [2_000, -2_000]) {
      await insertPurchasedLot(db, {
        productId: oats.productId,
        locationId,
        actorId: userId,
        remaining,
      });
    }
    await insertBalance(db, { productId: oats.productId, locationId, quantity: 0 });

    const body = (await currentStock(headers)).json();

    expect(body.products).toEqual([
      expect.objectContaining({
        id: oats.productId,
        balance: 0,
        lots: [expect.anything(), expect.anything()],
      }),
    ]);
  });

  it("reports only the products of the category asked for", async () => {
    const { headers, locationId, userId } = await signedInWith(db, ["view_reports"], NOON);
    const flour = await insertProduct(db, { name: "Harina", categoryName: "Almacén" });
    const soap = await insertProduct(db, { name: "Jabón", categoryName: "Limpieza" });
    for (const { productId } of [flour, soap]) {
      await insertPurchasedLot(db, { productId, locationId, actorId: userId, remaining: 1_000 });
      await insertBalance(db, { productId, locationId, quantity: 1_000 });
    }

    const body = (await currentStock(headers, `?category_id=${soap.categoryId}`)).json();

    expect(body.products.map(({ id }: { id: string }) => id)).toEqual([soap.productId]);
    expect(body.categories).toHaveLength(2);
  });
});

describe("GET /reports/current-stock after a register's count is applied", () => {
  const route = eventsRouteUnderTest();
  const CHAIN_KEY = Buffer.alloc(32, 3).toString("base64");
  const CASHIER = "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03";
  const COUNT_ID = "6d1f7c3a-5b2e-4f8a-9c4d-1e2f3a4b5c6d";

  beforeEach(() => {
    registerCurrentStockReportRoute(route.app, {
      db: route.db,
      backofficeOrigin: BACKOFFICE_ORIGIN,
      zoneRules: fixedZoneRulesSource(),
      now: () => EVENTS_NOW,
    });
  });

  it("includes the counted stock from the moment its event is applied, and not before", async () => {
    const installation = await insertEnrolledInstallation(route.db, {
      now: EVENTS_NOW,
      outboxChainKey: CHAIN_KEY,
    });
    await route.db.insert(users).values({
      id: CASHIER,
      firstName: "Ada",
      email: "ada@example.com",
      locationId: installation.locationId,
    });
    const { productId } = await insertProduct(route.db, { name: "Yerba", saleUnit: "UNIT" });
    const { headers } = await signedInWith(route.db, ["view_reports"], EVENTS_NOW, {
      locationId: installation.locationId,
    });
    const unlinked = {
      event_id: crypto.randomUUID(),
      device_seq: 1,
      aggregate_type: "StockMovement",
      aggregate_id: COUNT_ID,
      event_type: "opening_count_recorded",
      schema_version: 1,
      payload: { movement_id: COUNT_ID, product_id: productId, counted: 6_000, expires_on: null },
      occurred_at: "2026-10-06T11:00:00.000Z",
      actor_id: CASHIER,
    };
    const chain_hmac = hmacEventChain.link(CHAIN_KEY, null, canonicalOutboxEvent(unlinked));
    const read = () => route.app.inject({ method: "GET", url: "/reports/current-stock", headers });

    const pushed = await route.app.inject({
      method: "POST",
      url: "/events",
      payload: {
        app_version: "1.4.0",
        telemetry: { wal_size_bytes: 4096, disk_free_bytes: 50_000_000, disk_free_ratio: 0.42 },
        events: [{ ...unlinked, chain_hmac }],
      },
      headers: { authorization: `Bearer ${installation.deviceToken}` },
    });
    expect(pushed.json()).toMatchObject({ status: "ok", ack_seq: 1 });
    expect((await read()).json().products).toEqual([]);

    await applySyncedEventsTask(route.db, {
      zoneRules: fixedZoneRulesSource(),
      now: () => EVENTS_NOW,
    });

    expect((await read()).json().products).toEqual([
      expect.objectContaining({ id: productId, balance: 6_000 }),
    ]);
  });
});
