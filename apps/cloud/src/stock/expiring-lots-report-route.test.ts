import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { branchSettings, users } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { applySyncedEventsTask } from "../sync/apply-synced-events-task.js";
import { NOW as EVENTS_NOW, eventsRouteUnderTest } from "../sync/test-support/events-route.js";
import {
  cashSessionOpened,
  PUSHING_CHAIN_KEY,
  pushingDevice,
  saleCompleted,
} from "../sync/test-support/pushing-device.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededPriceListId } from "../test-support/seeded-price-list.js";
import { registerExpiringLotsReportRoute } from "./expiring-lots-report-route.js";
import { insertPurchasedLot, insertTechnicalLot } from "./test-support/lot-fixtures.js";
import {
  BACKOFFICE_ORIGIN,
  insertLocation,
  insertProduct,
  signedInWith,
} from "./test-support/stock-route-fixtures.js";

const NOW = new Date("2026-10-13T15:00:00.000Z");

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
  registerExpiringLotsReportRoute(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => NOW,
  });
});

afterEach(async () => {
  await app.close();
});

function expiringLotsReport(headers: Record<string, string>, query = "") {
  return app.inject({ method: "GET", url: `/reports/expiring-lots${query}`, headers });
}

function idsOf(body: { lots: { id: string }[] }): string[] {
  return body.lots.map(({ id }) => id);
}

describe("GET /reports/expiring-lots access", () => {
  it("returns 401 when no session cookie was sent", async () => {
    const response = await expiringLotsReport({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await expiringLotsReport({ ...headers, origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it.each(["manage_expiration_dates", "view_stock_balances"] as const)(
    "rejects a user holding %s but not view_reports",
    async (permission) => {
      const { headers } = await signedInWith(db, [permission], NOW);

      const response = await expiringLotsReport(headers);

      expect(response.statusCode).toBe(403);
    },
  );

  it("answers a user who may view reports", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await expiringLotsReport(headers);

    expect(response.statusCode).toBe(200);
  });

  it.each([
    ["only the first day", "?from=2026-12-01"],
    ["a period that ends before it starts", "?from=2026-12-31&to=2026-12-01"],
    ["a day that is not a calendar day", "?from=2026-02-30&to=2026-03-01"],
    ["a parameter given twice", "?from=2026-12-01&from=2026-12-02&to=2026-12-31"],
  ])("answers 400 to %s", async (_name, query) => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await expiringLotsReport(headers, query);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });
});

describe("GET /reports/expiring-lots", () => {
  it("answers an empty report for the branch's window when it holds no lot", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await expiringLotsReport(headers);

    expect(response.json()).toEqual({
      period: { from: "2026-10-13", to: "2026-11-12" },
      window_days: 30,
      lots: [],
      summary: { lot_count: 0, value_cents: 0, without_cost_count: 0 },
    });
  });

  it("lists the lots of the branch within the window its settings configure, soonest first", async () => {
    const { headers, locationId, userId } = await signedInWith(db, ["view_reports"], NOW);
    await db
      .update(branchSettings)
      .set({ expiringLotAlertDays: 45 })
      .where(eq(branchSettings.locationId, locationId));
    const cheese = await insertProduct(db, {
      name: "Queso cremoso",
      categoryName: "Lácteos",
      saleUnit: "KG",
    });
    const later = await insertPurchasedLot(db, {
      productId: cheese.productId,
      locationId,
      actorId: userId,
      expiresOn: "2026-11-25",
      lotNumber: "L-80",
      remaining: 2_000,
    });
    const sooner = await insertPurchasedLot(db, {
      productId: cheese.productId,
      locationId,
      actorId: userId,
      expiresOn: "2026-10-20",
      lotNumber: "L-77",
      remaining: 4_000,
    });
    await insertPurchasedLot(db, {
      productId: cheese.productId,
      locationId,
      actorId: userId,
      expiresOn: "2026-11-28",
    });
    await insertPurchasedLot(db, {
      productId: cheese.productId,
      locationId,
      actorId: userId,
      expiresOn: "2026-10-12",
    });

    const response = await expiringLotsReport(headers);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      period: { from: "2026-10-13", to: "2026-11-27" },
      window_days: 45,
      lots: [
        {
          id: sooner,
          lot_number: "L-77",
          expires_on: "2026-10-20",
          remaining: 4_000,
          value_cents: 20_000,
          expired: false,
          days_to_expiry: 7,
          product: {
            id: cheese.productId,
            name: "Queso cremoso",
            category_id: cheese.categoryId,
            category_name: "Lácteos",
            sale_unit: "KG",
          },
        },
        expect.objectContaining({ id: later, days_to_expiry: 43, value_cents: 10_000 }),
      ],
      summary: { lot_count: 2, value_cents: 30_000, without_cost_count: 0 },
    });
  });

  it("reports only the lots of the user's branch", async () => {
    const { headers, locationId, userId } = await signedInWith(db, ["view_reports"], NOW);
    const otherLocationId = await insertLocation(db);
    const { productId } = await insertProduct(db);
    const own = await insertPurchasedLot(db, {
      productId,
      locationId,
      actorId: userId,
      expiresOn: "2026-10-20",
    });
    await insertPurchasedLot(db, {
      productId,
      locationId: otherLocationId,
      actorId: userId,
      expiresOn: "2026-10-20",
    });

    const body = (await expiringLotsReport(headers)).json();

    expect(idsOf(body)).toEqual([own]);
    expect(body.summary.lot_count).toBe(1);
  });

  it("leaves out the lots without stock, the technical ones and those that do not expire", async () => {
    const { headers, locationId, userId } = await signedInWith(db, ["view_reports"], NOW);
    const { productId } = await insertProduct(db);
    const dated = await insertPurchasedLot(db, {
      productId,
      locationId,
      actorId: userId,
      expiresOn: "2026-10-20",
    });
    await insertPurchasedLot(db, {
      productId,
      locationId,
      actorId: userId,
      expiresOn: "2026-10-20",
      remaining: 0,
    });
    await insertPurchasedLot(db, { productId, locationId, actorId: userId, expiresOn: null });
    await insertTechnicalLot(db, { productId, locationId, remaining: 3_000 });

    const body = (await expiringLotsReport(headers)).json();

    expect(idsOf(body)).toEqual([dated]);
  });

  it("lists the lots of an asked period beyond the window", async () => {
    const { headers, locationId, userId } = await signedInWith(db, ["view_reports"], NOW);
    const { productId } = await insertProduct(db);
    const inPeriod = await insertPurchasedLot(db, {
      productId,
      locationId,
      actorId: userId,
      expiresOn: "2026-12-15",
    });
    await insertPurchasedLot(db, {
      productId,
      locationId,
      actorId: userId,
      expiresOn: "2026-10-20",
    });

    const body = (await expiringLotsReport(headers, "?from=2026-12-01&to=2026-12-31")).json();

    expect(body.period).toEqual({ from: "2026-12-01", to: "2026-12-31" });
    expect(body.window_days).toBe(30);
    expect(idsOf(body)).toEqual([inPeriod]);
  });

  it("lists the lots already expired that still hold stock when the asked period is in the past", async () => {
    const { headers, locationId, userId } = await signedInWith(db, ["view_reports"], NOW);
    const { productId } = await insertProduct(db);
    const expired = await insertPurchasedLot(db, {
      productId,
      locationId,
      actorId: userId,
      expiresOn: "2026-09-15",
    });

    const body = (await expiringLotsReport(headers, "?from=2026-09-01&to=2026-09-30")).json();

    expect(body.lots).toEqual([
      expect.objectContaining({ id: expired, expired: true, days_to_expiry: -28 }),
    ]);
  });
});

describe("GET /reports/expiring-lots after a register's sale is applied", () => {
  const route = eventsRouteUnderTest();

  beforeEach(() => {
    registerExpiringLotsReportRoute(route.app, {
      db: route.db,
      backofficeOrigin: BACKOFFICE_ORIGIN,
      now: () => EVENTS_NOW,
    });
  });

  it("drops the lot a sale emptied from the moment the sale's event is applied, and not before", async () => {
    const installation = await insertEnrolledInstallation(route.db, {
      now: EVENTS_NOW,
      outboxChainKey: PUSHING_CHAIN_KEY,
    });
    const cashier = "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03";
    await route.db.insert(users).values({
      id: cashier,
      firstName: "Ada",
      email: "ada@example.com",
      locationId: installation.locationId,
    });
    const { productId } = await insertProduct(route.db, { name: "Miel", saleUnit: "KG" });
    const lotId = await insertPurchasedLot(route.db, {
      productId,
      locationId: installation.locationId,
      actorId: cashier,
      expiresOn: "2026-10-10",
      remaining: 4_000,
    });
    const { headers } = await signedInWith(route.db, ["view_reports"], EVENTS_NOW, {
      locationId: installation.locationId,
    });
    const read = () =>
      route.app.inject({
        method: "GET",
        url: "/reports/expiring-lots?from=2026-10-01&to=2026-10-31",
        headers,
      });
    const sessionId = randomUUID();
    await pushingDevice(route.app, installation.deviceToken).push([
      cashSessionOpened(sessionId, "2026-10-06T11:00:00.000Z"),
      saleCompleted({
        saleId: randomUUID(),
        sessionId,
        completedAt: "2026-10-06T11:20:00.000Z",
        total: 36_000,
        payments: [{ amount: 36_000 }],
        line: {
          productId,
          priceListId: await seededPriceListId(route.db),
          listUnitPrice: 9_000,
          weight: { thousandths: 4_000, source: "MANUAL" },
        },
      }),
    ]);

    expect(idsOf((await read()).json())).toEqual([lotId]);

    await applySyncedEventsTask(route.db, { now: () => EVENTS_NOW });

    expect(idsOf((await read()).json())).toEqual([]);
  });
});
