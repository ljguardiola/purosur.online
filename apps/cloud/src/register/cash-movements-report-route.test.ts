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
import { registerCashMovementsReportRoute } from "./cash-movements-report-route.js";
import { applyCashMovement, applyOpenedCashSession } from "./test-support/applied-cash-sessions.js";
import { insertEnrolledInstallation } from "./test-support/enrolled-installation.js";

const NOW = new Date("2026-10-07T15:00:00.000Z");
const OPENED_AT = new Date("2026-10-07T11:00:00.000Z");
const MOVED_AT = new Date("2026-10-07T14:00:00.000Z");

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
  registerCashMovementsReportRoute(app, {
    zoneRules: fixedZoneRulesSource(),
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => NOW,
  });
});

afterEach(async () => {
  await app.close();
});

function cashMovements(headers: Record<string, string>, query = "") {
  return app.inject({ method: "GET", url: `/reports/cash-movements${query}`, headers });
}

async function recordMovements(
  openedBy: string,
  movements: { type: "CASH_IN" | "CASH_OUT" | "WITHDRAWAL"; amount: number; reason: string }[],
) {
  const installation = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 1" });
  const sessionId = await applyOpenedCashSession(db, {
    deviceId: installation.deviceId,
    openedBy,
    openedAt: OPENED_AT,
  });
  for (const movement of movements) {
    await applyCashMovement(db, {
      deviceId: installation.deviceId,
      sessionId,
      occurredAt: MOVED_AT,
      ...movement,
    });
  }
  return { ...installation, sessionId };
}

describe("GET /reports/cash-movements access", () => {
  it("returns 401 when no session cookie was sent", async () => {
    const response = await cashMovements({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await cashMovements({ ...headers, origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a user who may not view reports", async () => {
    const { headers } = await signedInWith(db, ["view_stock_balances"], NOW);

    const response = await cashMovements(headers);

    expect(response.statusCode).toBe(403);
  });

  it("answers a user who may view reports", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await cashMovements(headers);

    expect(response.statusCode).toBe(200);
  });
});

describe("GET /reports/cash-movements", () => {
  it("answers 400 to a parameter given twice", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await cashMovements(headers, "?from=2026-10-01&from=2026-10-02&to=2026-10-03");

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });

  it("reports the current Argentina day when no range is asked", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await cashMovements(headers);

    expect(response.json()).toEqual({
      range: { from: "2026-10-07", to: "2026-10-07" },
      totals: {
        cash_in: { movements: 0, amount: 0 },
        cash_out: { movements: 0, amount: 0 },
        withdrawal: { movements: 0, amount: 0 },
      },
      movements: [],
    });
  });

  it("reports the applied movements with the totals of each kind", async () => {
    const { headers, userId } = await signedInWith(db, ["view_reports"], NOW);
    const { sessionId } = await recordMovements(userId, [
      { type: "CASH_IN", amount: 1_000, reason: "Cambio" },
      { type: "CASH_OUT", amount: 800, reason: "Hielo" },
      { type: "CASH_OUT", amount: 200, reason: "Bolsas" },
      { type: "WITHDRAWAL", amount: 5_000, reason: "Caja fuerte" },
    ]);

    const response = await cashMovements(headers, "?from=2026-10-07&to=2026-10-07");

    const body = response.json();
    expect(body.range).toEqual({ from: "2026-10-07", to: "2026-10-07" });
    expect(body.totals).toEqual({
      cash_in: { movements: 1, amount: 1_000 },
      cash_out: { movements: 2, amount: 1_000 },
      withdrawal: { movements: 1, amount: 5_000 },
    });
    expect(body.movements).toHaveLength(4);
    expect(body.movements).toContainEqual({
      id: expect.any(String),
      occurred_at: "2026-10-07T14:00:00.000Z",
      kind: "WITHDRAWAL",
      reason: "Caja fuerte",
      amount: 5_000,
      session_id: sessionId,
      register_name: "Caja 1",
      session_opened_at: "2026-10-07T11:00:00.000Z",
    });
  });

  it("filters by an asked register of the branch", async () => {
    const { headers, userId } = await signedInWith(db, ["view_reports"], NOW);
    const { registerId } = await recordMovements(userId, [
      { type: "CASH_IN", amount: 100, reason: "Cambio" },
    ]);

    const ofTheRegister = await cashMovements(headers, `?register_id=${registerId}`);
    const ofAnotherRegister = await cashMovements(headers, `?register_id=${randomUUID()}`);

    expect(ofTheRegister.json().movements).toHaveLength(1);
    expect(ofAnotherRegister.json().movements).toHaveLength(0);
  });

  it("reports the branch of the session and never another", async () => {
    const otherLocationId = await insertLocation(db);
    const { headers, userId } = await signedInWith(db, ["view_reports"], NOW, {
      locationId: otherLocationId,
    });
    await recordMovements(userId, [{ type: "CASH_IN", amount: 100, reason: "Cambio" }]);

    const response = await cashMovements(headers);

    expect(response.json().movements).toEqual([]);
  });
});
