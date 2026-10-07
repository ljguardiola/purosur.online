import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { inbox, registers } from "../platform/db/schema.js";
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

function reportRegisters(headers: Record<string, string>) {
  return app.inject({ method: "GET", url: "/reports/registers", headers });
}

async function receiveSale(total: number): Promise<{ registerId: string }> {
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
      lines: [],
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

describe.each([
  ["GET /reports/sales-by-day", salesByDay],
  ["GET /reports/registers", reportRegisters],
])("%s access", (_name, request) => {
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
    ["a start without an end", "?from=2026-10-06"],
    ["a date that is not a calendar day", "?from=2026-02-30&to=2026-03-01"],
    ["a register that is not an id", "?register_id=caja-1"],
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

describe("GET /reports/registers", () => {
  it("lists the registers of the session's branch by name", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);
    const second = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 2" });
    const first = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 1" });
    await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: await anotherBranchRegister(),
    });

    const response = await reportRegisters(headers);

    expect(response.json()).toEqual({
      registers: [
        { id: first.registerId, name: "Caja 1" },
        { id: second.registerId, name: "Caja 2" },
      ],
    });
  });
});

async function anotherBranchRegister(): Promise<string> {
  const [register] = await db
    .insert(registers)
    .values({ locationId: await insertLocation(db), name: "Caja X" })
    .returning({ id: registers.id });
  if (!register) {
    throw new Error("test setup: seeding the register returned no row");
  }
  return register.id;
}
