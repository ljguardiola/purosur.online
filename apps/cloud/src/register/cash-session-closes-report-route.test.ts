import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  BACKOFFICE_ORIGIN,
  insertLocation,
  signedInWith,
} from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { registerCashSessionClosesReportRoute } from "./cash-session-closes-report-route.js";
import {
  applyClosedCashSession,
  applyOpenedCashSession,
} from "./test-support/applied-cash-sessions.js";
import { insertEnrolledInstallation } from "./test-support/enrolled-installation.js";

const NOW = new Date("2026-10-07T15:00:00.000Z");
const CLOSED_AT = new Date("2026-10-07T14:00:00.000Z");

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
  registerCashSessionClosesReportRoute(app, {
    zoneRules: fixedZoneRulesSource(),
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => NOW,
  });
});

afterEach(async () => {
  await app.close();
});

function cashSessionCloses(headers: Record<string, string>, query = "") {
  return app.inject({ method: "GET", url: `/reports/cash-session-closes${query}`, headers });
}

async function closeSession(openedBy: string, counted: { expected: number; counted: number }) {
  const installation = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 1" });
  const sessionId = await applyOpenedCashSession(db, {
    deviceId: installation.deviceId,
    openedBy,
    openedAt: new Date("2026-10-07T11:00:00.000Z"),
  });
  await applyClosedCashSession(db, {
    deviceId: installation.deviceId,
    sessionId,
    closedBy: openedBy,
    closedAt: CLOSED_AT,
    expectedCash: counted.expected,
    countedCash: counted.counted,
  });
  return { ...installation, sessionId };
}

describe("GET /reports/cash-session-closes access", () => {
  it("returns 401 when no session cookie was sent", async () => {
    const response = await cashSessionCloses({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await cashSessionCloses({ ...headers, origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a user who may not view reports", async () => {
    const { headers } = await signedInWith(db, ["view_stock_balances"], NOW);

    const response = await cashSessionCloses(headers);

    expect(response.statusCode).toBe(403);
  });

  it("answers a user who may view reports", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await cashSessionCloses(headers);

    expect(response.statusCode).toBe(200);
  });
});

describe("GET /reports/cash-session-closes", () => {
  it.each([
    ["a range ending before it starts", "?from=2026-10-06&to=2026-10-05"],
    ["a parameter given twice", "?from=2026-10-01&from=2026-10-02&to=2026-10-03"],
    ["a register that is not an id", "?register_id=caja-1"],
  ])("answers 400 to %s", async (_name, query) => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await cashSessionCloses(headers, query);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });

  it("reports the current Argentina day when no range is asked", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await cashSessionCloses(headers);

    expect(response.json()).toEqual({
      range: { from: "2026-10-07", to: "2026-10-07" },
      totals: { sessions: 0, net_difference: 0, with_difference: 0, cashiers: [] },
      sessions: [],
    });
  });

  it("reports the applied closes with the totals of the range", async () => {
    const { headers, userId } = await signedInWith(db, ["view_reports"], NOW);
    const { sessionId, registerId } = await closeSession(userId, {
      expected: 10_000,
      counted: 9_500,
    });

    const response = await cashSessionCloses(headers, "?from=2026-10-07&to=2026-10-07");

    expect(response.json()).toEqual({
      range: { from: "2026-10-07", to: "2026-10-07" },
      totals: {
        sessions: 1,
        net_difference: -500,
        with_difference: 1,
        cashiers: [{ cashier_id: userId, cashier_name: expect.any(String), sessions: 1 }],
      },
      sessions: [
        {
          id: sessionId,
          closed_at: "2026-10-07T14:00:00.000Z",
          register_id: registerId,
          register_name: "Caja 1",
          cashier_id: userId,
          cashier_name: expect.any(String),
          closed_by_id: userId,
          closed_by_name: expect.any(String),
          expected_cash: 10_000,
          counted_cash: 9_500,
          difference: -500,
          has_difference: true,
        },
      ],
    });
  });

  it("filters by an asked register of the branch", async () => {
    const { headers, userId } = await signedInWith(db, ["view_reports"], NOW);
    const { registerId } = await closeSession(userId, { expected: 100, counted: 100 });

    const ofTheRegister = await cashSessionCloses(headers, `?register_id=${registerId}`);
    const ofAnotherRegister = await cashSessionCloses(headers, `?register_id=${randomUUID()}`);

    expect(ofTheRegister.json().totals.sessions).toBe(1);
    expect(ofAnotherRegister.json().totals.sessions).toBe(0);
  });

  it("reports the branch of the session and never another", async () => {
    const otherLocationId = await insertLocation(db);
    const { headers, userId } = await signedInWith(db, ["view_reports"], NOW, {
      locationId: otherLocationId,
    });
    await closeSession(userId, { expected: 100, counted: 100 });

    const response = await cashSessionCloses(headers);

    expect(response.json().totals.sessions).toBe(0);
  });
});
