import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  auditLog,
  fiscalAddresses,
  locations,
  offlineNumberBlocks,
  pointOfSaleClaims,
  registerOfflinePointsOfSale,
  registerPointsOfSale,
  registers,
  taxAuthorityLastAuthorizedNumbers,
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
import { registerRegisterOfflinePointOfSaleConfigurationRoute } from "./register-offline-point-of-sale-configuration-route.js";
import { registerRegisterPointOfSaleConfigurationRoute } from "./register-point-of-sale-configuration-route.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;
let enqueuedCounts: number[];

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
  enqueuedCounts = [];
  const options = { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => SESSION_NOON };
  registerRegisterPointOfSaleConfigurationRoute(app, options);
  registerRegisterOfflinePointOfSaleConfigurationRoute(app, {
    ...options,
    enqueueTaxAuthorityCount: async (_transaction, pointOfSale) => {
      enqueuedCounts.push(pointOfSale);
    },
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

async function insertFiscalAddress(): Promise<string> {
  const [fiscalAddress] = await db
    .insert(fiscalAddresses)
    .values({ name: "Deposito Central", streetAddress: "Calle Ficticia 123, CABA" })
    .returning({ id: fiscalAddresses.id });
  if (!fiscalAddress) {
    throw new Error("test setup: seeding the fiscal address returned no row");
  }
  return fiscalAddress.id;
}

async function giveRealTimePointOfSale(
  registerId: string,
  number: number,
  headers: Record<string, string>,
) {
  const response = await app.inject({
    method: "PUT",
    url: `/registers/${registerId}/point-of-sale`,
    headers,
    payload: {
      point_of_sale_number: number,
      fiscal_address_id: await insertFiscalAddress(),
      version: 0,
    },
  });
  expect(response.statusCode).toBe(200);
}

async function holdTaxAuthorityCount(pointOfSaleNumber: number, lastAuthorized: number) {
  await db
    .insert(taxAuthorityLastAuthorizedNumbers)
    .values({ pointOfSaleNumber, lastAuthorized, readAt: SESSION_NOON });
}

function configureOffline(
  registerId: string,
  payload: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return app.inject({
    method: "PUT",
    url: `/registers/${registerId}/offline-point-of-sale`,
    headers,
    payload,
  });
}

function bodyFor(overrides: Record<string, unknown> = {}) {
  return { point_of_sale_number: 8, version: 0, ...overrides };
}

describe("PUT /registers/:id/offline-point-of-sale", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const registerId = await insertRegister("Caja 1");

    const response = await configureOffline(registerId, bodyFor(), { origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own, changing nothing", async () => {
    const registerId = await insertRegister("Caja 1");
    const session = await sessionWith(["change_fiscal_configuration"]);

    const response = await configureOffline(registerId, bodyFor(), {
      ...session.headers,
      origin: "https://attacker.example",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    expect(await db.select().from(registerOfflinePointsOfSale)).toEqual([]);
  });

  it("rejects a user holding only the permission to enroll registers with 403 forbidden, changing nothing", async () => {
    const registerId = await insertRegister("Caja 1");
    const session = await sessionWith(["enroll_register_devices"]);

    const response = await configureOffline(registerId, bodyFor(), session.headers);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    expect(await db.select().from(registerOfflinePointsOfSale)).toEqual([]);
  });

  it("returns 401 authorization_required and changes nothing without a recent passkey, even for a register with no real-time point of sale", async () => {
    const registerId = await insertRegister("Caja 1");
    const session = await sessionWith(["change_fiscal_configuration"], false);

    const response = await configureOffline(registerId, bodyFor(), session.headers);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authorization_required" });
    expect(await db.select().from(pointOfSaleClaims)).toEqual([]);
  });

  it("answers a body that does not match its shape with 400 validation_failed, before asking for a passkey", async () => {
    const registerId = await insertRegister("Caja 1");
    const session = await sessionWith(["change_fiscal_configuration"], false);

    const response = await configureOffline(
      registerId,
      bodyFor({ point_of_sale_number: 100000 }),
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

    const response = await configureOffline("not-a-uuid", bodyFor(), session.headers);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "id" }],
    });
  });

  it("answers 404 not_found for a register of another branch", async () => {
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    if (!otherLocation) {
      throw new Error("test setup: seeding the other location returned no row");
    }
    const registerId = await insertRegister("Caja 1", otherLocation.id);
    const session = await sessionWith(["change_fiscal_configuration"]);

    const response = await configureOffline(registerId, bodyFor(), session.headers);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
  });

  it("answers 409 real_time_point_of_sale_missing for a register with no real-time point of sale, changing nothing", async () => {
    const registerId = await insertRegister("Caja 1");
    const session = await sessionWith(["change_fiscal_configuration"]);

    const response = await configureOffline(registerId, bodyFor(), session.headers);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "real_time_point_of_sale_missing" });
    expect(await db.select().from(pointOfSaleClaims)).toEqual([]);
    expect(await db.select().from(registerOfflinePointsOfSale)).toEqual([]);
  });

  it("configures the register's offline point of sale, answering it at version 1, audited under the actor and logged for the register", async () => {
    const registerId = await insertRegister("Caja 1");
    const session = await sessionWith(["change_fiscal_configuration"]);
    await giveRealTimePointOfSale(registerId, 7, session.headers);
    await holdTaxAuthorityCount(8, 0);
    const mark = await lastLoggedChangeSeq(db);

    const response = await configureOffline(registerId, bodyFor(), session.headers);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      register_id: registerId,
      point_of_sale_number: 8,
      version: 1,
    });
    expect(await db.select().from(registerOfflinePointsOfSale)).toEqual([
      { registerId, pointOfSaleNumber: 8, mechanism: "offline", version: 1 },
    ]);
    const entries = (
      await db.select().from(auditLog).where(eq(auditLog.entityId, registerId))
    ).filter(({ entity }) => entity === "register_offline_point_of_sale");
    expect(entries).toMatchObject([{ actorId: session.userId, at: SESSION_NOON }]);
    expect(await changesLoggedAfter(db, mark)).toMatchObject([
      { entity: "register_offline_point_of_sale", entityId: registerId, version: 1 },
      { entity: "offline_number_block", version: 1, op: "insert" },
    ]);
  });

  it("assigns the offline point of sale its first block of numbers, delivered to the register", async () => {
    const registerId = await insertRegister("Caja 1");
    const session = await sessionWith(["change_fiscal_configuration"]);
    await giveRealTimePointOfSale(registerId, 7, session.headers);
    await holdTaxAuthorityCount(8, 0);
    const mark = await lastLoggedChangeSeq(db);

    await configureOffline(registerId, bodyFor(), session.headers);

    const blocks = await db.select().from(offlineNumberBlocks);
    expect(blocks).toMatchObject([
      {
        pointOfSaleNumber: 8,
        documentType: "factura_c",
        registerId,
        firstNumber: 1,
        lastNumber: 1000,
        status: "in_use",
        assignedAt: SESSION_NOON,
        version: 1,
      },
    ]);
    const logged = await changesLoggedAfter(db, mark);
    expect(logged.find(({ entity }) => entity === "offline_number_block")?.entityId).toBe(
      blocks[0]?.id,
    );
  });

  it("answers 200 with no block, and asks for the tax authority's count, while the cloud holds none", async () => {
    const registerId = await insertRegister("Caja 1");
    const session = await sessionWith(["change_fiscal_configuration"]);
    await giveRealTimePointOfSale(registerId, 7, session.headers);

    const response = await configureOffline(registerId, bodyFor(), session.headers);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      register_id: registerId,
      point_of_sale_number: 8,
      version: 1,
    });
    expect(await db.select().from(offlineNumberBlocks)).toEqual([]);
    expect(enqueuedCounts).toEqual([8]);
  });

  it("answers 200 with no block, and asks for nothing, when invoicing is not configured", async () => {
    const withoutInvoicing = Fastify();
    registerRegisterOfflinePointOfSaleConfigurationRoute(withoutInvoicing, {
      db,
      backofficeOrigin: BACKOFFICE_ORIGIN,
      now: () => SESSION_NOON,
    });
    const registerId = await insertRegister("Caja 1");
    const session = await sessionWith(["change_fiscal_configuration"]);
    await giveRealTimePointOfSale(registerId, 7, session.headers);

    const response = await withoutInvoicing.inject({
      method: "PUT",
      url: `/registers/${registerId}/offline-point-of-sale`,
      headers: session.headers,
      payload: bodyFor(),
    });
    await withoutInvoicing.close();

    expect(response.statusCode).toBe(200);
    expect(await db.select().from(offlineNumberBlocks)).toEqual([]);
    expect(enqueuedCounts).toEqual([]);
  });

  it("assigns no block when the configuration is refused", async () => {
    const registerId = await insertRegister("Caja 1");
    const session = await sessionWith(["change_fiscal_configuration"]);

    await configureOffline(registerId, bodyFor(), session.headers);

    expect(await db.select().from(offlineNumberBlocks)).toEqual([]);
  });

  it("answers the current offline point of sale, unchanged, when nothing differs", async () => {
    const registerId = await insertRegister("Caja 1");
    const session = await sessionWith(["change_fiscal_configuration"]);
    await giveRealTimePointOfSale(registerId, 7, session.headers);
    await configureOffline(registerId, bodyFor(), session.headers);

    const response = await configureOffline(registerId, bodyFor({ version: 1 }), session.headers);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ point_of_sale_number: 8, version: 1 });
  });

  it("answers 409 point_of_sale_taken for a number held as a real-time point of sale, changing nothing", async () => {
    const registerId = await insertRegister("Caja 1");
    const session = await sessionWith(["change_fiscal_configuration"]);
    await giveRealTimePointOfSale(registerId, 7, session.headers);

    const response = await configureOffline(
      registerId,
      bodyFor({ point_of_sale_number: 7 }),
      session.headers,
    );

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: "point_of_sale_taken",
      details: [{ field: "point_of_sale_number" }],
    });
    expect(await db.select().from(registerOfflinePointsOfSale)).toEqual([]);
  });

  it("answers 409 stale_version when the offline point of sale changed since it was loaded", async () => {
    const registerId = await insertRegister("Caja 1");
    const session = await sessionWith(["change_fiscal_configuration"]);
    await giveRealTimePointOfSale(registerId, 7, session.headers);
    await configureOffline(registerId, bodyFor(), session.headers);

    const response = await configureOffline(
      registerId,
      bodyFor({ point_of_sale_number: 9 }),
      session.headers,
    );

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "stale_version" });
    expect(await db.select().from(registerPointsOfSale)).toHaveLength(1);
  });
});
