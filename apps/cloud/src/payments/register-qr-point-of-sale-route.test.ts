import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditLog, locations, registerQrPointsOfSale, registers } from "../platform/db/schema.js";
import { changesLoggedAfter, lastLoggedChangeSeq } from "../sync/test-support/logged-changes.js";
import {
  BACKOFFICE_ORIGIN,
  type BackofficeSession,
  openBackofficeSession,
  SESSION_NOON,
} from "../test-support/backoffice-session.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerRegisterQrPointOfSaleRoute } from "./register-qr-point-of-sale-route.js";

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
  registerRegisterQrPointOfSaleRoute(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => SESSION_NOON,
  });
});

afterEach(async () => {
  await app.close();
});

async function sessionWith(permissionKeys: string[]): Promise<BackofficeSession> {
  return openBackofficeSession(db, {
    now: SESSION_NOON,
    locationId: await seededLocationId(db),
    permissionKeys,
    passkeyAuthorized: false,
  });
}

async function insertRegister(name: string, locationId?: string): Promise<string> {
  const [register] = await db
    .insert(registers)
    .values({ locationId: locationId ?? (await seededLocationId(db)), name })
    .returning({ id: registers.id });
  if (!register) {
    throw new Error("test setup: seeding the register returned no row");
  }
  return register.id;
}

function assignQrPointOfSale(
  registerId: string,
  payload: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return app.inject({
    method: "PUT",
    url: `/registers/${registerId}/qr-point-of-sale`,
    headers,
    payload,
  });
}

const QR_POINT_OF_SALE = "CAJA1_STORE_POS";

describe("PUT /registers/:id/qr-point-of-sale", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const registerId = await insertRegister("Caja 1");

    const response = await assignQrPointOfSale(
      registerId,
      { external_pos_id: QR_POINT_OF_SALE, version: 0 },
      { origin: BACKOFFICE_ORIGIN },
    );

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own, changing nothing", async () => {
    const registerId = await insertRegister("Caja 1");
    const session = await sessionWith(["change_fiscal_configuration"]);

    const response = await assignQrPointOfSale(
      registerId,
      { external_pos_id: QR_POINT_OF_SALE, version: 0 },
      { ...session.headers, origin: "https://attacker.example" },
    );

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    expect(await db.select().from(registerQrPointsOfSale)).toEqual([]);
  });

  it("rejects a user holding only the permission to enroll registers with 403 forbidden, changing nothing", async () => {
    const registerId = await insertRegister("Caja 1");
    const session = await sessionWith(["enroll_register_devices"]);

    const response = await assignQrPointOfSale(
      registerId,
      { external_pos_id: QR_POINT_OF_SALE, version: 0 },
      session.headers,
    );

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    expect(await db.select().from(registerQrPointsOfSale)).toEqual([]);
  });

  it("answers a body that does not match its shape with 400 validation_failed", async () => {
    const registerId = await insertRegister("Caja 1");
    const session = await sessionWith(["change_fiscal_configuration"]);

    const response = await assignQrPointOfSale(
      registerId,
      { external_pos_id: "has spaces", version: 0 },
      session.headers,
    );

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "external_pos_id" }],
    });
    expect(await db.select().from(registerQrPointsOfSale)).toEqual([]);
  });

  it("answers 400 validation_failed naming id for a malformed register id", async () => {
    const session = await sessionWith(["change_fiscal_configuration"]);

    const response = await assignQrPointOfSale(
      "not-a-uuid",
      { external_pos_id: QR_POINT_OF_SALE, version: 0 },
      session.headers,
    );

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "id" }],
    });
  });

  it("answers 404 not_found for a register nobody has", async () => {
    const session = await sessionWith(["change_fiscal_configuration"]);

    const response = await assignQrPointOfSale(
      "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      { external_pos_id: QR_POINT_OF_SALE, version: 0 },
      session.headers,
    );

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
  });

  it("answers 404 not_found for a register of another branch, changing nothing", async () => {
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    if (!otherLocation) {
      throw new Error("test setup: seeding the other location returned no row");
    }
    const registerId = await insertRegister("Caja 1", otherLocation.id);
    const session = await sessionWith(["change_fiscal_configuration"]);

    const response = await assignQrPointOfSale(
      registerId,
      { external_pos_id: QR_POINT_OF_SALE, version: 0 },
      session.headers,
    );

    expect(response.statusCode).toBe(404);
    expect(await db.select().from(registerQrPointsOfSale)).toEqual([]);
  });

  it("assigns the QR point of sale, answering it at version 1 with no passkey, audited under the actor and logged for the register", async () => {
    const registerId = await insertRegister("Caja 1");
    const session = await sessionWith(["change_fiscal_configuration"]);
    const mark = await lastLoggedChangeSeq(db);

    const response = await assignQrPointOfSale(
      registerId,
      { external_pos_id: ` ${QR_POINT_OF_SALE} `, version: 0 },
      session.headers,
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      register_id: registerId,
      external_pos_id: QR_POINT_OF_SALE,
      version: 1,
    });
    expect(await db.select().from(registerQrPointsOfSale)).toEqual([
      { registerId, externalPosId: QR_POINT_OF_SALE, version: 1 },
    ]);
    const entries = await db.select().from(auditLog).where(eq(auditLog.entityId, registerId));
    expect(entries).toMatchObject([
      { entity: "register_qr_point_of_sale", actorId: session.userId, at: SESSION_NOON },
    ]);
    expect(await changesLoggedAfter(db, mark)).toMatchObject([
      { entity: "register_qr_point_of_sale", entityId: registerId, version: 1 },
    ]);
  });

  it("clears the assignment when the QR point of sale is null", async () => {
    const registerId = await insertRegister("Caja 1");
    const session = await sessionWith(["change_fiscal_configuration"]);
    await assignQrPointOfSale(
      registerId,
      { external_pos_id: QR_POINT_OF_SALE, version: 0 },
      session.headers,
    );

    const response = await assignQrPointOfSale(
      registerId,
      { external_pos_id: null, version: 1 },
      session.headers,
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ register_id: registerId, external_pos_id: null, version: 2 });
  });

  it("answers the current assignment, unchanged, when nothing differs", async () => {
    const registerId = await insertRegister("Caja 1");
    const session = await sessionWith(["change_fiscal_configuration"]);
    await assignQrPointOfSale(
      registerId,
      { external_pos_id: QR_POINT_OF_SALE, version: 0 },
      session.headers,
    );

    const response = await assignQrPointOfSale(
      registerId,
      { external_pos_id: QR_POINT_OF_SALE, version: 1 },
      session.headers,
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      register_id: registerId,
      external_pos_id: QR_POINT_OF_SALE,
      version: 1,
    });
  });

  it("answers 409 qr_point_of_sale_taken for a QR point of sale another register holds, changing nothing", async () => {
    const registerId = await insertRegister("Caja 1");
    const otherRegisterId = await insertRegister("Caja 2");
    const session = await sessionWith(["change_fiscal_configuration"]);
    await assignQrPointOfSale(
      otherRegisterId,
      { external_pos_id: QR_POINT_OF_SALE, version: 0 },
      session.headers,
    );

    const response = await assignQrPointOfSale(
      registerId,
      { external_pos_id: QR_POINT_OF_SALE, version: 0 },
      session.headers,
    );

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: "qr_point_of_sale_taken",
      details: [{ field: "external_pos_id" }],
    });
    expect(await db.select().from(registerQrPointsOfSale)).toHaveLength(1);
  });

  it("answers 409 stale_version when the assignment changed since it was loaded", async () => {
    const registerId = await insertRegister("Caja 1");
    const session = await sessionWith(["change_fiscal_configuration"]);
    await assignQrPointOfSale(
      registerId,
      { external_pos_id: QR_POINT_OF_SALE, version: 0 },
      session.headers,
    );

    const response = await assignQrPointOfSale(
      registerId,
      { external_pos_id: "CAJA2_STORE_POS", version: 0 },
      session.headers,
    );

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "stale_version" });
  });
});
