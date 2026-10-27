import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertRegisterOf } from "../fiscal/test-support/issued-document-fixtures.js";
import { users } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { aSoldLine } from "../sales/test-support/sold-lines.js";
import {
  BACKOFFICE_ORIGIN,
  insertLocation,
  signedInWith,
} from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { registerReturnsReportRoutes } from "./returns-report-routes.js";
import { applyReturn } from "./test-support/applied-returns.js";

const NOW = new Date("2026-10-12T15:00:00.000Z");
const SOLD = new Date("2026-10-01T14:00:00.000Z");
const RETURNED = new Date("2026-10-06T14:00:00.000Z");

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
  registerReturnsReportRoutes(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    zoneRules: fixedZoneRulesSource(),
    now: () => NOW,
  });
});

afterEach(async () => {
  await app.close();
});

async function aRegister(name: string, locationId?: string) {
  if (locationId === undefined) {
    return insertEnrolledInstallation(db, { now: NOW, registerName: name });
  }
  const existingRegisterId = await insertRegisterOf(db, locationId, name);
  return insertEnrolledInstallation(db, { now: NOW, existingRegisterId });
}

function returnsReport(headers: Record<string, string>, query = "") {
  return app.inject({ method: "GET", url: `/reports/returns${query}`, headers });
}

describe("GET /reports/returns access", () => {
  it("returns 401 when no session cookie was sent", async () => {
    const response = await returnsReport({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const { headers } = await signedInWith(db, ["view_returns_report"], NOW);

    const response = await returnsReport({ ...headers, origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a user who may view reports but not the returns report", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await returnsReport(headers);

    expect(response.statusCode).toBe(403);
  });

  it("answers a user who may view the returns report", async () => {
    const { headers } = await signedInWith(db, ["view_returns_report"], NOW);

    const response = await returnsReport(headers);

    expect(response.statusCode).toBe(200);
  });

  it("answers 400 to half a period", async () => {
    const { headers } = await signedInWith(db, ["view_returns_report"], NOW);

    const response = await returnsReport(headers, "?from=2026-10-01");

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });
});

describe("GET /reports/returns", () => {
  const range = "?from=2026-10-06&to=2026-10-06";

  it("answers an empty report when the branch made no returns", async () => {
    const { headers } = await signedInWith(db, ["view_returns_report"], NOW);

    const response = await returnsReport(headers, range);

    expect(response.json()).toEqual({
      range: { from: "2026-10-06", to: "2026-10-06" },
      typed: { rows: [], totals: { returns: 0, refunded: 0 } },
      scanned: { rows: [], totals: { returns: 0, refunded: 0 } },
    });
  });

  it("keeps a typed return apart from a scanned one and shows each as the wire describes it", async () => {
    const { headers, locationId } = await signedInWith(db, ["view_returns_report"], NOW);
    const { deviceId, registerId } = await aRegister("Caja 1");
    const cashierId = randomUUID();
    await db
      .insert(users)
      .values({ id: cashierId, firstName: "Ana", email: "ana@example.com", locationId });
    const queso = aSoldLine(randomUUID(), "Queso cremoso", 800, 3_200, "SCALE");
    const typed = await applyReturn(db, {
      deviceId,
      soldAt: SOLD,
      returnedAt: RETURNED,
      sale: { actorId: cashierId, operationNumber: 7, total: 3_200, lines: [queso] },
      saleReturn: {
        actorId: cashierId,
        ticketSource: "TYPED",
        lines: [
          {
            saleLineId: queso.id,
            productId: queso.productId,
            quantity: 300,
            reason: "defective",
            disposition: "discard",
            refundedAmount: 1_200,
          },
        ],
      },
    });
    const scanned = await applyReturn(db, {
      deviceId,
      soldAt: SOLD,
      returnedAt: new Date("2026-10-06T15:00:00.000Z"),
      saleReturn: { actorId: cashierId, ticketSource: "QR" },
    });

    const response = await returnsReport(headers, range);

    expect(response.json()).toEqual({
      range: { from: "2026-10-06", to: "2026-10-06" },
      typed: {
        rows: [
          {
            return_id: typed.saleReturn.id,
            occurred_at: "2026-10-06T14:00:00.000Z",
            register: { id: registerId, name: "Caja 1" },
            sale: { id: typed.completed.id, operation_number: 7, invoice: null },
            cashier: { id: cashierId, name: "Ana" },
            authorizer: null,
            lines: [
              {
                sale_line_id: queso.id,
                product_name: "Queso cremoso",
                sale_unit: "KG",
                quantity: 300,
                reason: "defective",
                disposition: "discard",
                refunded: 1_200,
              },
            ],
            refunded: 1_200,
          },
        ],
        totals: { returns: 1, refunded: 1_200 },
      },
      scanned: {
        rows: [expect.objectContaining({ return_id: scanned.saleReturn.id })],
        totals: { returns: 1, refunded: 2_400 },
      },
    });
  });

  it("reports only the branch of the session, whatever the query says", async () => {
    const { headers } = await signedInWith(db, ["view_returns_report"], NOW);
    const here = await aRegister("Caja 1");
    const elsewhere = await aRegister("Caja otra", await insertLocation(db));
    const mine = await applyReturn(db, {
      deviceId: here.deviceId,
      soldAt: SOLD,
      returnedAt: RETURNED,
    });
    await applyReturn(db, { deviceId: elsewhere.deviceId, soldAt: SOLD, returnedAt: RETURNED });

    const response = await returnsReport(headers, `${range}&location_id=${elsewhere.locationId}`);

    expect(response.json().scanned.rows.map((row: { return_id: string }) => row.return_id)).toEqual(
      [mine.saleReturn.id],
    );
  });

  it("reports only the register asked for", async () => {
    const { headers } = await signedInWith(db, ["view_returns_report"], NOW);
    const first = await aRegister("Caja 1");
    const second = await aRegister("Caja 2", first.locationId);
    await applyReturn(db, { deviceId: first.deviceId, soldAt: SOLD, returnedAt: RETURNED });
    const wanted = await applyReturn(db, {
      deviceId: second.deviceId,
      soldAt: SOLD,
      returnedAt: RETURNED,
    });

    const response = await returnsReport(headers, `${range}&register_id=${second.registerId}`);

    expect(response.json().scanned.rows.map((row: { return_id: string }) => row.return_id)).toEqual(
      [wanted.saleReturn.id],
    );
  });
});
