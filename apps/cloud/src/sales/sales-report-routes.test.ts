import { randomUUID } from "node:crypto";
import type { JsonValue } from "@purosur/domain";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { inbox, users } from "../platform/db/schema.js";
import { insertDiscount } from "../pricing/test-support/discount-route-fixtures.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import {
  BACKOFFICE_ORIGIN,
  insertLocation,
  signedInWith,
} from "../stock/test-support/stock-route-fixtures.js";
import { applySyncedEventsTask } from "../sync/apply-synced-events-task.js";
import { insertInboxEvent } from "../sync/test-support/inbox-events.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { registerSalesReportRoutes } from "./sales-report-routes.js";
import { applyCompletedSale } from "./test-support/applied-sales.js";
import {
  aSoldLine,
  insertCategoryNamed,
  insertProductIn,
  withManualAdjustment,
} from "./test-support/sold-lines.js";

const NOW = new Date("2026-10-07T15:00:00.000Z");
const USER = "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03";

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
  registerSalesReportRoutes(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOW });
});

afterEach(async () => {
  await app.close();
});

function salesByDay(headers: Record<string, string>, query = "") {
  return app.inject({ method: "GET", url: `/reports/sales-by-day${query}`, headers });
}

async function receiveSale(
  total: number,
  lines: JsonValue[] = [],
): Promise<{ registerId: string }> {
  const { deviceId, registerId } = await insertEnrolledInstallation(db, {
    now: NOW,
    registerName: "Caja 1",
  });
  const sessionId = randomUUID();
  const saleId = randomUUID();
  await insertInboxEvent(db, deviceId, {
    aggregateType: "CashSession",
    aggregateId: sessionId,
    eventType: "cash_session_opened",
    schemaVersion: 1,
    payload: {
      opened_by: USER,
      opened_at: "2026-10-07T13:00:00.000Z",
      opening_float: 10_000,
    },
    receivedAt: new Date("2026-10-07T13:00:05.000Z"),
  });
  await insertInboxEvent(db, deviceId, {
    aggregateType: "Sale",
    aggregateId: saleId,
    eventType: "sale_completed",
    schemaVersion: 2,
    payload: {
      id: saleId,
      register_id: registerId,
      device_id: deviceId,
      session_id: sessionId,
      actor_id: USER,
      occurred_at: "2026-10-07T14:00:00.000Z",
      total,
      lines,
      cash_movements: [],
      payments: [
        {
          id: randomUUID(),
          kind: "SALE",
          method: "CASH",
          provider: "NONE",
          amount: total,
          tendered: total,
          state: "APPROVED",
          occurred_at: "2026-10-07T14:00:00.000Z",
          authorized_by: null,
          confirmed_at: null,
        },
      ],
    },
    receivedAt: new Date("2026-10-07T14:00:05.000Z"),
  });
  return { registerId };
}

describe("GET /reports/sales-by-day access", () => {
  const request = salesByDay;

  it("returns 401 when no session cookie was sent", async () => {
    const response = await request({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await request({ ...headers, origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a user who may not view reports", async () => {
    const { headers } = await signedInWith(db, ["view_stock_balances"], NOW);

    const response = await request(headers);

    expect(response.statusCode).toBe(403);
  });

  it("answers a user who may view reports", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await request(headers);

    expect(response.statusCode).toBe(200);
  });
});

describe("GET /reports/sales-by-day", () => {
  it.each([
    ["a range ending before it starts", "?from=2026-10-06&to=2026-10-05"],
    ["a parameter given twice", "?from=2026-10-01&from=2026-10-02&to=2026-10-03"],
  ])("answers 400 to %s", async (_name, query) => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await salesByDay(headers, query);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });

  it("reports the current Argentina day when no range is asked", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await salesByDay(headers);

    expect(response.json()).toEqual({
      range: { from: "2026-10-07", to: "2026-10-07" },
      days: [],
      totals: { sales_count: 0, total: 0 },
    });
  });

  it("shows a pushed sale only once its event was applied", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);
    await receiveSale(4_800);

    const before = await salesByDay(headers, "?from=2026-10-07&to=2026-10-07");
    await applySyncedEventsTask(db, { now: () => NOW });
    const after = await salesByDay(headers, "?from=2026-10-07&to=2026-10-07");

    expect(before.json().totals).toEqual({ sales_count: 0, total: 0 });
    expect(after.json()).toEqual({
      range: { from: "2026-10-07", to: "2026-10-07" },
      days: [{ day: "2026-10-07", sales_count: 1, total: 4_800 }],
      totals: { sales_count: 1, total: 4_800 },
    });
    expect(await db.select().from(inbox)).toHaveLength(2);
  });

  it("filters by an asked register of the branch", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);
    const { registerId } = await receiveSale(4_800);
    await applySyncedEventsTask(db, { now: () => NOW });

    const ofTheRegister = await salesByDay(headers, `?register_id=${registerId}`);
    const ofAnotherRegister = await salesByDay(headers, `?register_id=${randomUUID()}`);

    expect(ofTheRegister.json().totals).toEqual({ sales_count: 1, total: 4_800 });
    expect(ofAnotherRegister.json().totals).toEqual({ sales_count: 0, total: 0 });
  });

  it("reports the branch of the session and never another", async () => {
    const otherLocationId = await insertLocation(db);
    const { headers } = await signedInWith(db, ["view_reports"], NOW, {
      locationId: otherLocationId,
    });
    await receiveSale(4_800);
    await applySyncedEventsTask(db, { now: () => NOW });

    const response = await salesByDay(headers);

    expect(response.json().totals).toEqual({ sales_count: 0, total: 0 });
  });
});

function salesByProductAndCategory(headers: Record<string, string>, query = "?group=product") {
  return app.inject({
    method: "GET",
    url: `/reports/sales-by-product-and-category${query}`,
    headers,
  });
}

describe("GET /reports/sales-by-product-and-category access", () => {
  const request = salesByProductAndCategory;

  it("returns 401 when no session cookie was sent", async () => {
    const response = await request({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await request({ ...headers, origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a user who may not view reports", async () => {
    const { headers } = await signedInWith(db, ["view_stock_balances"], NOW);

    const response = await request(headers);

    expect(response.statusCode).toBe(403);
  });

  it("answers a user who may view reports", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await request(headers);

    expect(response.statusCode).toBe(200);
  });
});

describe("GET /reports/sales-by-product-and-category", () => {
  it.each([
    ["no group", ""],
    ["a group that is not offered", "?group=brand"],
    ["a range ending before it starts", "?group=product&from=2026-10-06&to=2026-10-05"],
    ["a parameter given twice", "?group=product&group=category"],
  ])("answers 400 to %s", async (_name, query) => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await salesByProductAndCategory(headers, query);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });

  it("reports the current Argentina day when no range is asked", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await salesByProductAndCategory(headers, "?group=category");

    expect(response.json()).toEqual({
      range: { from: "2026-10-07", to: "2026-10-07" },
      group: "category",
      rows: [],
      totals: { units: 0, thousandths: 0, amount: 0 },
    });
  });

  it("answers the units, the weight and the amount of each product or category", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);
    const { deviceId } = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 1" });
    const grocery = await insertCategoryNamed(db, "Almacén");
    const sweets = await insertCategoryNamed(db, "Dulces", grocery);
    const sugar = await insertProductIn(db, grocery, "Azúcar");
    const cheese = await insertProductIn(db, sweets, "Dulce de leche");
    const lines = [
      aSoldLine(sugar, "Azúcar", 3, 7_200),
      aSoldLine(cheese, "Dulce de leche", 1_500, 9_000, "SCALE"),
    ];
    await applyCompletedSale(db, {
      deviceId,
      completedAt: new Date("2026-10-07T14:00:00.000Z"),
      total: 16_200,
      overrides: { lines },
    });

    const byProduct = await salesByProductAndCategory(headers, "?group=product");
    const byCategory = await salesByProductAndCategory(headers, "?group=category");

    expect(byProduct.json()).toEqual({
      range: { from: "2026-10-07", to: "2026-10-07" },
      group: "product",
      rows: [
        { id: cheese, path: ["Dulce de leche"], units: 0, thousandths: 1_500, amount: 9_000 },
        { id: sugar, path: ["Azúcar"], units: 3, thousandths: 0, amount: 7_200 },
      ],
      totals: { units: 3, thousandths: 1_500, amount: 16_200 },
    });
    expect(byCategory.json()).toEqual({
      range: { from: "2026-10-07", to: "2026-10-07" },
      group: "category",
      rows: [
        { id: sweets, path: ["Almacén", "Dulces"], units: 0, thousandths: 1_500, amount: 9_000 },
        { id: grocery, path: ["Almacén"], units: 3, thousandths: 0, amount: 7_200 },
      ],
      totals: { units: 3, thousandths: 1_500, amount: 16_200 },
    });
  });

  it("filters by an asked register of the branch", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);
    const { deviceId, registerId } = await insertEnrolledInstallation(db, {
      now: NOW,
      registerName: "Caja 1",
    });
    await applyCompletedSale(db, {
      deviceId,
      completedAt: new Date("2026-10-07T14:00:00.000Z"),
      total: 500,
      overrides: { lines: [aSoldLine(randomUUID(), "Retirado", 1, 500)] },
    });

    const ofTheRegister = await salesByProductAndCategory(
      headers,
      `?group=product&register_id=${registerId}`,
    );
    const ofAnotherRegister = await salesByProductAndCategory(
      headers,
      `?group=product&register_id=${randomUUID()}`,
    );

    expect(ofTheRegister.json().totals.amount).toBe(500);
    expect(ofAnotherRegister.json().totals.amount).toBe(0);
  });

  it("reports the branch of the session and never another", async () => {
    const otherLocationId = await insertLocation(db);
    const { headers } = await signedInWith(db, ["view_reports"], NOW, {
      locationId: otherLocationId,
    });
    const { deviceId } = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 1" });
    await applyCompletedSale(db, {
      deviceId,
      completedAt: new Date("2026-10-07T14:00:00.000Z"),
      total: 500,
      overrides: { lines: [aSoldLine(randomUUID(), "Retirado", 1, 500)] },
    });

    const response = await salesByProductAndCategory(headers, "?group=category");

    expect(response.json().rows).toEqual([]);
  });
});

function salesByCashier(headers: Record<string, string>, query = "") {
  return app.inject({ method: "GET", url: `/reports/sales-by-cashier${query}`, headers });
}

describe("GET /reports/sales-by-cashier access", () => {
  const request = salesByCashier;

  it("returns 401 when no session cookie was sent", async () => {
    const response = await request({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await request({ ...headers, origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a user who may not view reports", async () => {
    const { headers } = await signedInWith(db, ["view_stock_balances"], NOW);

    const response = await request(headers);

    expect(response.statusCode).toBe(403);
  });

  it("answers a user who may view reports", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await request(headers);

    expect(response.statusCode).toBe(200);
  });
});

describe("GET /reports/sales-by-cashier", () => {
  it.each([
    ["a range ending before it starts", "?from=2026-10-06&to=2026-10-05"],
    ["a register that is not an id", "?register_id=caja-1"],
    ["a parameter given twice", "?from=2026-10-01&from=2026-10-02&to=2026-10-03"],
  ])("answers 400 to %s", async (_name, query) => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await salesByCashier(headers, query);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });

  it("reports the current Argentina day when no range is asked", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await salesByCashier(headers);

    expect(response.json()).toEqual({
      range: { from: "2026-10-07", to: "2026-10-07" },
      rows: [],
      totals: { cashiers: 0, sales_count: 0, total: 0, average_ticket: null },
    });
  });

  it("answers the sessions, sales, amount and average ticket of each cashier, the one with most sales first", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);
    const { deviceId, locationId } = await insertEnrolledInstallation(db, {
      now: NOW,
      registerName: "Caja 1",
    });
    const ana = randomUUID();
    const stranger = randomUUID();
    await db.insert(users).values({
      id: ana,
      firstName: "Ana",
      email: "ana@example.com",
      locationId,
    });
    const completedAt = new Date("2026-10-07T14:00:00.000Z");
    const soldBy = (actorId: string, total: number) =>
      applyCompletedSale(db, { deviceId, completedAt, total, overrides: { actorId, lines: [] } });
    await soldBy(ana, 1_000);
    await soldBy(ana, 2_000);
    await soldBy(stranger, 9_000);

    const response = await salesByCashier(headers);

    expect(response.json()).toEqual({
      range: { from: "2026-10-07", to: "2026-10-07" },
      rows: [
        {
          cashier_id: ana,
          name: "Ana",
          sessions: 2,
          sales_count: 2,
          total: 3_000,
          average_ticket: 1_500,
        },
        {
          cashier_id: stranger,
          name: null,
          sessions: 1,
          sales_count: 1,
          total: 9_000,
          average_ticket: 9_000,
        },
      ],
      totals: { cashiers: 2, sales_count: 3, total: 12_000, average_ticket: 4_000 },
    });
  });

  it("shows a pushed sale only once its event was applied", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);
    await receiveSale(4_800);

    const before = await salesByCashier(headers, "?from=2026-10-07&to=2026-10-07");
    await applySyncedEventsTask(db, { now: () => NOW });
    const after = await salesByCashier(headers, "?from=2026-10-07&to=2026-10-07");

    expect(before.json().rows).toEqual([]);
    expect(after.json().rows).toEqual([
      {
        cashier_id: USER,
        name: null,
        sessions: 1,
        sales_count: 1,
        total: 4_800,
        average_ticket: 4_800,
      },
    ]);
  });

  it("filters by an asked register of the branch", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);
    const { registerId } = await receiveSale(4_800);
    await applySyncedEventsTask(db, { now: () => NOW });

    const ofTheRegister = await salesByCashier(headers, `?register_id=${registerId}`);
    const ofAnotherRegister = await salesByCashier(headers, `?register_id=${randomUUID()}`);

    expect(ofTheRegister.json().totals.total).toBe(4_800);
    expect(ofAnotherRegister.json().totals.total).toBe(0);
  });

  it("reports the branch of the session and never another", async () => {
    const otherLocationId = await insertLocation(db);
    const { headers } = await signedInWith(db, ["view_reports"], NOW, {
      locationId: otherLocationId,
    });
    await receiveSale(4_800);
    await applySyncedEventsTask(db, { now: () => NOW });

    const response = await salesByCashier(headers);

    expect(response.json().rows).toEqual([]);
  });
});

function salesByPromotion(headers: Record<string, string>, query = "") {
  return app.inject({ method: "GET", url: `/reports/sales-by-promotion${query}`, headers });
}

function promotionLine(promotionId: string, discountAmount: number) {
  return {
    id: randomUUID(),
    product_id: randomUUID(),
    product_name: "Yerba 1 kg",
    quantity: 2,
    list_unit_price: 2_400,
    price_list_id: randomUUID(),
    promotion_id: promotionId,
    discount_amount: discountAmount,
    promotions: [],
    line_total: 4_800 - discountAmount,
  };
}

describe("GET /reports/sales-by-promotion access", () => {
  const request = salesByPromotion;

  it("returns 401 when no session cookie was sent", async () => {
    const response = await request({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await request({ ...headers, origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a user who may not view reports", async () => {
    const { headers } = await signedInWith(db, ["view_stock_balances"], NOW);

    const response = await request(headers);

    expect(response.statusCode).toBe(403);
  });

  it("answers a user who may view reports", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await request(headers);

    expect(response.statusCode).toBe(200);
  });
});

describe("GET /reports/sales-by-promotion", () => {
  it.each([
    ["a range ending before it starts", "?from=2026-10-06&to=2026-10-05"],
    ["a register that is not an id", "?register_id=caja-1"],
    ["a parameter given twice", "?from=2026-10-01&from=2026-10-02&to=2026-10-03"],
  ])("answers 400 to %s", async (_name, query) => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await salesByPromotion(headers, query);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });

  it("reports the current Argentina day when no range is asked", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await salesByPromotion(headers);

    expect(response.json()).toEqual({
      range: { from: "2026-10-07", to: "2026-10-07" },
      rows: [],
      totals: { discounted: 0, lines: 0, most_used: null },
    });
  });

  it("answers the lines, units and amount discounted of each promotion, the largest amount first", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);
    const { deviceId } = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 1" });
    const categoryId = await insertCategoryNamed(db, "Almacén");
    const finde = await insertDiscount(db, {
      now: NOW,
      name: "Finde",
      categoryId,
      weekdays: [6, 7],
    });
    const missing = randomUUID();
    const soldLine = (promotionId: string, discountAmount: number) => ({
      ...aSoldLine(randomUUID(), "Yerba 1 kg", 2, 4_800 - discountAmount),
      promotionId,
      discountAmount,
    });
    await applyCompletedSale(db, {
      deviceId,
      completedAt: new Date("2026-10-07T14:00:00.000Z"),
      total: 9_000,
      overrides: {
        lines: [soldLine(finde.id, 300), soldLine(finde.id, 200), soldLine(missing, 900)],
      },
    });

    const response = await salesByPromotion(headers);

    expect(response.json()).toEqual({
      range: { from: "2026-10-07", to: "2026-10-07" },
      rows: [
        {
          promotion_id: missing,
          name: null,
          terms: null,
          lines: 1,
          units: 2,
          thousandths: 0,
          discounted: 900,
        },
        {
          promotion_id: finde.id,
          name: "Finde",
          terms: {
            benefit: { kind: "PERCENT_OFF", percent: 15 },
            target: { kind: "CATEGORY", name: "Almacén" },
            weekdays: [6, 7],
          },
          lines: 2,
          units: 4,
          thousandths: 0,
          discounted: 500,
        },
      ],
      totals: {
        discounted: 1_400,
        lines: 3,
        most_used: { promotion_id: finde.id, name: "Finde", lines: 2 },
      },
    });
  });

  it("shows a pushed sale only once its event was applied", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);
    const missing = randomUUID();
    await receiveSale(4_700, [promotionLine(missing, 100)]);

    const before = await salesByPromotion(headers, "?from=2026-10-07&to=2026-10-07");
    await applySyncedEventsTask(db, { now: () => NOW });
    const after = await salesByPromotion(headers, "?from=2026-10-07&to=2026-10-07");

    expect(before.json().rows).toEqual([]);
    expect(after.json().rows).toEqual([
      {
        promotion_id: missing,
        name: null,
        terms: null,
        lines: 1,
        units: 2,
        thousandths: 0,
        discounted: 100,
      },
    ]);
  });

  it("filters by an asked register of the branch", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);
    const { registerId } = await receiveSale(4_700, [promotionLine(randomUUID(), 100)]);
    await applySyncedEventsTask(db, { now: () => NOW });

    const ofTheRegister = await salesByPromotion(headers, `?register_id=${registerId}`);
    const ofAnotherRegister = await salesByPromotion(headers, `?register_id=${randomUUID()}`);

    expect(ofTheRegister.json().totals.discounted).toBe(100);
    expect(ofAnotherRegister.json().totals.discounted).toBe(0);
  });

  it("reports the branch of the session and never another", async () => {
    const otherLocationId = await insertLocation(db);
    const { headers } = await signedInWith(db, ["view_reports"], NOW, {
      locationId: otherLocationId,
    });
    await receiveSale(4_700, [promotionLine(randomUUID(), 100)]);
    await applySyncedEventsTask(db, { now: () => NOW });

    const response = await salesByPromotion(headers);

    expect(response.json().rows).toEqual([]);
  });
});

function manualDiscounts(headers: Record<string, string>, query = "") {
  return app.inject({ method: "GET", url: `/reports/manual-discounts${query}`, headers });
}

describe("GET /reports/manual-discounts access", () => {
  const request = manualDiscounts;

  it("returns 401 when no session cookie was sent", async () => {
    const response = await request({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await request({ ...headers, origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a user who may not view reports", async () => {
    const { headers } = await signedInWith(db, ["view_stock_balances"], NOW);

    const response = await request(headers);

    expect(response.statusCode).toBe(403);
  });

  it("answers a user who may view reports", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await request(headers);

    expect(response.statusCode).toBe(200);
  });
});

describe("GET /reports/manual-discounts", () => {
  async function aCashier(firstName: string, locationId: string): Promise<string> {
    const id = randomUUID();
    await db.insert(users).values({ id, firstName, email: `${id}@example.com`, locationId });
    return id;
  }

  async function discountedSales() {
    const { deviceId, locationId, registerId } = await insertEnrolledInstallation(db, {
      now: NOW,
      registerName: "Caja 1",
    });
    const ana = await aCashier("Ana", locationId);
    const beto = await aCashier("Beto", locationId);
    const productId = randomUUID();
    const line = withManualAdjustment(
      { ...aSoldLine(productId, "Yerba 1 kg", 2, 2_000), listUnitPrice: 1_000 },
      { kind: "PERCENT", percent: 10, reason: "Envase dañado", authorizedBy: null },
    );
    const lineSaleId = await applyCompletedSale(db, {
      deviceId,
      completedAt: new Date("2026-10-07T13:00:00.000Z"),
      total: 1_800,
      overrides: { actorId: ana, operationNumber: 4, lines: [line] },
    });
    const totalSaleId = await applyCompletedSale(db, {
      deviceId,
      completedAt: new Date("2026-10-07T14:00:00.000Z"),
      total: 4_300,
      overrides: {
        actorId: ana,
        operationNumber: 5,
        saleDiscount: {
          kind: "AMOUNT",
          amount: 700,
          reason: "Cliente frecuente",
          authorizedBy: beto,
        },
        saleDiscountAmount: 700,
      },
    });
    return { ana, beto, registerId, line, lineSaleId, totalSaleId };
  }

  it.each([
    ["a range ending before it starts", "?from=2026-10-06&to=2026-10-05"],
    ["a register that is not an id", "?register_id=caja-1"],
    ["an authorizer that is not an id", "?authorized_by=Ana"],
    ["a parameter given twice", "?from=2026-10-01&from=2026-10-02&to=2026-10-03"],
  ])("answers 400 to %s", async (_name, query) => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await manualDiscounts(headers, query);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });

  it("reports the current Argentina day when no range is asked", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await manualDiscounts(headers);

    expect(response.json()).toEqual({
      range: { from: "2026-10-07", to: "2026-10-07" },
      rows: [],
      totals: { discounted: 0, count: 0, line_count: 0, sale_count: 0, most_authorized: null },
      authorizers: [],
    });
  });

  it("answers each discount with who authorized it, the totals and everyone who authorized one", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);
    const { ana, beto, line, lineSaleId, totalSaleId } = await discountedSales();

    const response = await manualDiscounts(headers);

    expect(response.json()).toEqual({
      range: { from: "2026-10-07", to: "2026-10-07" },
      rows: [
        {
          kind: "SALE",
          sale_id: totalSaleId,
          operation_number: 5,
          line_id: null,
          completed_at: "2026-10-07T14:00:00.000Z",
          product_name: null,
          adjustment: { kind: "AMOUNT", value: 700 },
          reason: "Cliente frecuente",
          authorizer: { id: beto, name: "Beto" },
          discounted: 700,
        },
        {
          kind: "LINE",
          sale_id: lineSaleId,
          operation_number: 4,
          line_id: line.id,
          completed_at: "2026-10-07T13:00:00.000Z",
          product_name: "Yerba 1 kg",
          adjustment: { kind: "PERCENT", value: 10 },
          reason: "Envase dañado",
          authorizer: { id: ana, name: "Ana" },
          discounted: 200,
        },
      ],
      totals: {
        discounted: 900,
        count: 2,
        line_count: 1,
        sale_count: 1,
        most_authorized: { id: beto, name: "Beto", count: 1 },
      },
      authorizers: [
        { id: ana, name: "Ana" },
        { id: beto, name: "Beto" },
      ],
    });
  });

  it("limits the discounts to those an asked person authorized and still offers everyone", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);
    const { ana, beto } = await discountedSales();

    const response = await manualDiscounts(headers, `?authorized_by=${ana}`);

    expect(response.json().rows).toHaveLength(1);
    expect(response.json().totals).toMatchObject({ discounted: 200, count: 1 });
    expect(response.json().authorizers).toEqual([
      { id: ana, name: "Ana" },
      { id: beto, name: "Beto" },
    ]);
  });

  it("filters by an asked register of the branch", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);
    const { registerId } = await discountedSales();

    const ofTheRegister = await manualDiscounts(headers, `?register_id=${registerId}`);
    const ofAnotherRegister = await manualDiscounts(headers, `?register_id=${randomUUID()}`);

    expect(ofTheRegister.json().totals.count).toBe(2);
    expect(ofAnotherRegister.json().totals.count).toBe(0);
  });

  it("reports the branch of the session and never another", async () => {
    const otherLocationId = await insertLocation(db);
    const { headers } = await signedInWith(db, ["view_reports"], NOW, {
      locationId: otherLocationId,
    });
    await discountedSales();

    const response = await manualDiscounts(headers);

    expect(response.json().rows).toEqual([]);
  });
});

function averageTicket(headers: Record<string, string>, query = "") {
  return app.inject({ method: "GET", url: `/reports/average-ticket${query}`, headers });
}

describe("GET /reports/average-ticket access", () => {
  const request = averageTicket;

  it("returns 401 when no session cookie was sent", async () => {
    const response = await request({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await request({ ...headers, origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a user who may not view reports", async () => {
    const { headers } = await signedInWith(db, ["view_stock_balances"], NOW);

    const response = await request(headers);

    expect(response.statusCode).toBe(403);
  });

  it("answers a user who may view reports", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await request(headers);

    expect(response.statusCode).toBe(200);
  });
});

describe("GET /reports/average-ticket", () => {
  it.each([
    ["a range ending before it starts", "?from=2026-10-06&to=2026-10-05"],
    ["a register that is not an id", "?register_id=caja-1"],
    ["a parameter given twice", "?from=2026-10-01&from=2026-10-02&to=2026-10-03"],
  ])("answers 400 to %s", async (_name, query) => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await averageTicket(headers, query);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });

  it("compares the current Argentina day with the day before when no range is asked", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await averageTicket(headers);

    expect(response.json()).toEqual({
      range: { from: "2026-10-07", to: "2026-10-07" },
      previous_range: { from: "2026-10-06", to: "2026-10-06" },
      current: { sales_count: 0, total: 0, average_ticket: null },
      previous: { sales_count: 0, total: 0, average_ticket: null },
      change_tenths: null,
      weeks: [],
    });
  });

  it("answers no previous period when the range starts on the first calendar day", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await averageTicket(headers, "?from=0001-01-01&to=0001-01-07");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      previous_range: null,
      previous: null,
      change_tenths: null,
    });
  });

  it("answers the average ticket of the range, of the range before it and their difference", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);
    const { deviceId } = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 1" });
    const soldOn = (completedAt: string, total: number) =>
      applyCompletedSale(db, { deviceId, completedAt: new Date(completedAt), total });
    await soldOn("2026-10-06T14:00:00.000Z", 1_000);
    await soldOn("2026-10-06T15:00:00.000Z", 3_000);
    await soldOn("2026-10-07T14:00:00.000Z", 3_000);
    await soldOn("2026-10-07T15:00:00.000Z", 3_600);

    const response = await averageTicket(headers, "?from=2026-10-07&to=2026-10-07");

    expect(response.json()).toEqual({
      range: { from: "2026-10-07", to: "2026-10-07" },
      previous_range: { from: "2026-10-06", to: "2026-10-06" },
      current: { sales_count: 2, total: 6_600, average_ticket: 3_300 },
      previous: { sales_count: 2, total: 4_000, average_ticket: 2_000 },
      change_tenths: 650,
      weeks: [
        {
          from: "2026-10-07",
          to: "2026-10-07",
          sales_count: 2,
          total: 6_600,
          average_ticket: 3_300,
        },
      ],
    });
  });

  it("shows a pushed sale only once its event was applied", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);
    await receiveSale(4_800);

    const before = await averageTicket(headers, "?from=2026-10-07&to=2026-10-07");
    await applySyncedEventsTask(db, { now: () => NOW });
    const after = await averageTicket(headers, "?from=2026-10-07&to=2026-10-07");

    expect(before.json().current).toEqual({ sales_count: 0, total: 0, average_ticket: null });
    expect(after.json().current).toEqual({ sales_count: 1, total: 4_800, average_ticket: 4_800 });
  });

  it("filters by an asked register of the branch", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);
    const { registerId } = await receiveSale(4_800);
    await applySyncedEventsTask(db, { now: () => NOW });

    const ofTheRegister = await averageTicket(headers, `?register_id=${registerId}`);
    const ofAnotherRegister = await averageTicket(headers, `?register_id=${randomUUID()}`);

    expect(ofTheRegister.json().current.total).toBe(4_800);
    expect(ofAnotherRegister.json().current.total).toBe(0);
  });

  it("reports the branch of the session and never another", async () => {
    const otherLocationId = await insertLocation(db);
    const { headers } = await signedInWith(db, ["view_reports"], NOW, {
      locationId: otherLocationId,
    });
    await receiveSale(4_800);
    await applySyncedEventsTask(db, { now: () => NOW });

    const response = await averageTicket(headers);

    expect(response.json().current.sales_count).toBe(0);
  });
});
