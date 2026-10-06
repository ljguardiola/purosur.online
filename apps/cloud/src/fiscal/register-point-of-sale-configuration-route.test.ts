import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  auditLog,
  fiscalAddresses,
  locations,
  pointOfSaleClaims,
  registerPointsOfSale,
  registers,
} from "../platform/db/schema.js";
import { changesLoggedAfter, lastLoggedChangeSeq } from "../sync/test-support/logged-changes.js";
import {
  BACKOFFICE_ORIGIN,
  type BackofficeSession,
  openBackofficeSession,
  SESSION_NOON,
} from "../test-support/backoffice-session.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerRegisterPointOfSaleConfigurationRoute } from "./register-point-of-sale-configuration-route.js";

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
  registerRegisterPointOfSaleConfigurationRoute(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => SESSION_NOON,
  });
});

afterEach(async () => {
  await app.close();
});

async function sessionWith(
  permissionKeys: string[],
  passkeyAuthorized = true,
): Promise<BackofficeSession> {
  return openBackofficeSession(db, {
    now: SESSION_NOON,
    locationId: await seededLocationId(db),
    permissionKeys,
    passkeyAuthorized,
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

async function insertFiscalAddress(name = "Deposito Central"): Promise<string> {
  const [fiscalAddress] = await db
    .insert(fiscalAddresses)
    .values({ name, streetAddress: "Calle Ficticia 123, CABA" })
    .returning({ id: fiscalAddresses.id });
  if (!fiscalAddress) {
    throw new Error("test setup: seeding the fiscal address returned no row");
  }
  return fiscalAddress.id;
}

function configurePointOfSale(
  registerId: string,
  payload: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return app.inject({
    method: "PUT",
    url: `/registers/${registerId}/point-of-sale`,
    headers,
    payload,
  });
}

function bodyFor(fiscalAddressId: string, overrides: Record<string, unknown> = {}) {
  return { point_of_sale_number: 7, fiscal_address_id: fiscalAddressId, version: 0, ...overrides };
}

describe("PUT /registers/:id/point-of-sale", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const registerId = await insertRegister("Caja 1");

    const response = await configurePointOfSale(registerId, bodyFor(await insertFiscalAddress()), {
      origin: BACKOFFICE_ORIGIN,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own, changing nothing", async () => {
    const registerId = await insertRegister("Caja 1");
    const session = await sessionWith(["change_fiscal_configuration"]);

    const response = await configurePointOfSale(registerId, bodyFor(await insertFiscalAddress()), {
      ...session.headers,
      origin: "https://attacker.example",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    expect(await db.select().from(registerPointsOfSale)).toEqual([]);
  });

  it("rejects a user holding only the permission to enroll registers with 403 forbidden, changing nothing", async () => {
    const registerId = await insertRegister("Caja 1");
    const session = await sessionWith(["enroll_register_devices"]);

    const response = await configurePointOfSale(
      registerId,
      bodyFor(await insertFiscalAddress()),
      session.headers,
    );

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    expect(await db.select().from(registerPointsOfSale)).toEqual([]);
  });

  it("returns 401 authorization_required and changes nothing without a recent passkey", async () => {
    const registerId = await insertRegister("Caja 1");
    const session = await sessionWith(["change_fiscal_configuration"], false);

    const response = await configurePointOfSale(
      registerId,
      bodyFor(await insertFiscalAddress()),
      session.headers,
    );

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authorization_required" });
    expect(await db.select().from(pointOfSaleClaims)).toEqual([]);
    expect(await db.select().from(registerPointsOfSale)).toEqual([]);
  });

  it("answers a body that does not match its shape with 400 validation_failed, before asking for a passkey", async () => {
    const registerId = await insertRegister("Caja 1");
    const session = await sessionWith(["change_fiscal_configuration"], false);

    const response = await configurePointOfSale(
      registerId,
      bodyFor(await insertFiscalAddress(), { point_of_sale_number: 100000 }),
      session.headers,
    );

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "point_of_sale_number" }],
    });
  });

  it("answers 400 validation_failed naming id for a malformed register id, changing nothing", async () => {
    const session = await sessionWith(["change_fiscal_configuration"]);

    const response = await configurePointOfSale(
      "not-a-uuid",
      bodyFor(await insertFiscalAddress()),
      session.headers,
    );

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "id" }],
    });
    expect(await db.select().from(pointOfSaleClaims)).toEqual([]);
    expect(await db.select().from(registerPointsOfSale)).toEqual([]);
  });

  it.each(["7c9e6679-7425-40de-944b-e07fc1f90ae7"])(
    "answers 404 not_found for the register %s",
    async (registerId) => {
      const session = await sessionWith(["change_fiscal_configuration"]);

      const response = await configurePointOfSale(
        registerId,
        bodyFor(await insertFiscalAddress()),
        session.headers,
      );

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: "not_found" });
    },
  );

  it("answers 404 not_found for a register of another branch", async () => {
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    if (!otherLocation) {
      throw new Error("test setup: seeding the other location returned no row");
    }
    const registerId = await insertRegister("Caja 1", otherLocation.id);
    const session = await sessionWith(["change_fiscal_configuration"]);

    const response = await configurePointOfSale(
      registerId,
      bodyFor(await insertFiscalAddress()),
      session.headers,
    );

    expect(response.statusCode).toBe(404);
    expect(await db.select().from(registerPointsOfSale)).toEqual([]);
  });

  it("answers 400 validation_failed on the fiscal address when no such fiscal address exists", async () => {
    const registerId = await insertRegister("Caja 1");
    const session = await sessionWith(["change_fiscal_configuration"]);

    const response = await configurePointOfSale(
      registerId,
      bodyFor("7c9e6679-7425-40de-944b-e07fc1f90ae7"),
      session.headers,
    );

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "fiscal_address_id" }],
    });
    expect(await db.select().from(pointOfSaleClaims)).toEqual([]);
  });

  it("configures the register's point of sale, answering it at version 1, audited under the actor and logged for the register", async () => {
    const registerId = await insertRegister("Caja 1");
    const fiscalAddressId = await insertFiscalAddress();
    const session = await sessionWith(["change_fiscal_configuration"]);
    const mark = await lastLoggedChangeSeq(db);

    const response = await configurePointOfSale(
      registerId,
      bodyFor(fiscalAddressId),
      session.headers,
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      register_id: registerId,
      point_of_sale_number: 7,
      fiscal_address_id: fiscalAddressId,
      version: 1,
    });
    expect(await db.select().from(registerPointsOfSale)).toEqual([
      { registerId, pointOfSaleNumber: 7, fiscalAddressId, version: 1 },
    ]);
    const entries = await db.select().from(auditLog).where(eq(auditLog.entityId, registerId));
    expect(entries).toMatchObject([
      { entity: "register_point_of_sale", actorId: session.userId, at: SESSION_NOON },
    ]);
    expect(await changesLoggedAfter(db, mark)).toMatchObject([
      { entity: "register_point_of_sale", entityId: registerId, version: 1 },
    ]);
  });

  it("answers the current point of sale, unchanged, when nothing differs", async () => {
    const registerId = await insertRegister("Caja 1");
    const fiscalAddressId = await insertFiscalAddress();
    const session = await sessionWith(["change_fiscal_configuration"]);
    await configurePointOfSale(registerId, bodyFor(fiscalAddressId), session.headers);

    const response = await configurePointOfSale(
      registerId,
      bodyFor(fiscalAddressId, { version: 1 }),
      session.headers,
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ point_of_sale_number: 7, version: 1 });
  });

  it("answers 409 point_of_sale_taken for a number another register holds, changing nothing", async () => {
    const registerId = await insertRegister("Caja 1");
    const otherRegisterId = await insertRegister("Caja 2");
    const fiscalAddressId = await insertFiscalAddress();
    const session = await sessionWith(["change_fiscal_configuration"]);
    await configurePointOfSale(otherRegisterId, bodyFor(fiscalAddressId), session.headers);

    const response = await configurePointOfSale(
      registerId,
      bodyFor(fiscalAddressId),
      session.headers,
    );

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: "point_of_sale_taken",
      details: [{ field: "point_of_sale_number" }],
    });
    expect(await db.select().from(registerPointsOfSale)).toHaveLength(1);
  });

  it("answers 409 stale_version when the register's point of sale changed since it was loaded", async () => {
    const registerId = await insertRegister("Caja 1");
    const fiscalAddressId = await insertFiscalAddress();
    const session = await sessionWith(["change_fiscal_configuration"]);
    await configurePointOfSale(registerId, bodyFor(fiscalAddressId), session.headers);

    const response = await configurePointOfSale(
      registerId,
      bodyFor(fiscalAddressId, { point_of_sale_number: 8 }),
      session.headers,
    );

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "stale_version" });
  });
});
