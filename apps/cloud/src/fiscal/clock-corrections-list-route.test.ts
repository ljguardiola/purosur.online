import { clockCorrectionListSchema } from "@purosur/contracts";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  BACKOFFICE_ORIGIN,
  openBackofficeSession,
  SESSION_NOON,
} from "../test-support/backoffice-session.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerClockCorrectionsListRoute } from "./clock-corrections-list-route.js";
import {
  insertClockCorrection,
  insertOtherLocation,
  insertRegisterAndActor,
} from "./test-support/clock-correction-fixtures.js";

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
  registerClockCorrectionsListRoute(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => SESSION_NOON,
  });
});

afterEach(async () => {
  await app.close();
});

function listCorrections(headers: Record<string, string>) {
  return app.inject({ method: "GET", url: "/registers/clock-corrections", headers });
}

describe("GET /registers/clock-corrections", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await listCorrections({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects a user holding only the permission to enroll registers with 403 forbidden", async () => {
    const session = await openBackofficeSession(db, {
      now: SESSION_NOON,
      locationId: await seededLocationId(db),
      permissionKeys: ["enroll_register_devices"],
    });

    const response = await listCorrections(session.headers);

    expect(response.statusCode).toBe(403);
  });

  it("rejects a request from another origin before reading anything", async () => {
    const session = await openBackofficeSession(db, {
      now: SESSION_NOON,
      locationId: await seededLocationId(db),
      permissionKeys: ["change_fiscal_configuration"],
    });

    const response = await listCorrections({
      ...session.headers,
      origin: "https://elsewhere.example.com",
    });

    expect(response.statusCode).toBe(403);
  });

  it("lists the branch's corrections newest first, with the register, the person and the alert's state", async () => {
    const locationId = await seededLocationId(db);
    const { registerId, actorId } = await insertRegisterAndActor(db, {
      locationId,
      registerName: "Caja 1",
      actorName: "Ada",
    });
    const older = await insertClockCorrection(db, {
      registerId,
      actorId,
      correctedAt: new Date("2026-10-04T12:00:00.000Z"),
      alertClosed: true,
    });
    const newer = await insertClockCorrection(db, {
      registerId,
      actorId,
      correctedAt: new Date("2026-10-05T12:00:00.000Z"),
      pointOfSale: 9,
      previousReadingSource: "tax_authority_day",
    });
    const session = await openBackofficeSession(db, {
      now: SESSION_NOON,
      locationId,
      permissionKeys: ["change_fiscal_configuration"],
      passkeyAuthorized: false,
    });

    const response = await listCorrections(session.headers);

    expect(response.statusCode).toBe(200);
    expect(clockCorrectionListSchema.parse(response.json())).toEqual([
      {
        id: newer.eventId,
        corrected_at: "2026-10-05T12:00:00.000Z",
        register_id: registerId,
        register_name: "Caja 1",
        point_of_sale_number: 9,
        document_type: "factura_c",
        actor_id: actorId,
        actor_first_name: "Ada",
        previous_reading: "2026-10-20T12:00:00.000Z",
        previous_reading_source: "tax_authority_day",
        corrected_reading: "2026-10-05T12:00:00.000Z",
        alert_state: "open",
      },
      {
        id: older.eventId,
        corrected_at: "2026-10-04T12:00:00.000Z",
        register_id: registerId,
        register_name: "Caja 1",
        point_of_sale_number: 7,
        document_type: "factura_c",
        actor_id: actorId,
        actor_first_name: "Ada",
        previous_reading: "2026-10-20T12:00:00.000Z",
        previous_reading_source: "clock_mark",
        corrected_reading: "2026-10-04T12:00:00.000Z",
        alert_state: "closed",
      },
    ]);
  });

  it("lists nothing of another branch's registers", async () => {
    const locationId = await seededLocationId(db);
    const other = await insertRegisterAndActor(db, {
      locationId: await insertOtherLocation(db),
      registerName: "Caja 9",
      actorName: "Berta",
    });
    await insertClockCorrection(db, {
      ...other,
      correctedAt: new Date("2026-10-05T12:00:00.000Z"),
    });
    const session = await openBackofficeSession(db, {
      now: SESSION_NOON,
      locationId,
      permissionKeys: ["change_fiscal_configuration"],
      passkeyAuthorized: false,
    });

    const response = await listCorrections(session.headers);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });
});
