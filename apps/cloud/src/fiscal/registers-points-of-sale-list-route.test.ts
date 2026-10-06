import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  fiscalAddresses,
  locations,
  pointOfSaleClaims,
  registerPointsOfSale,
  registers,
} from "../platform/db/schema.js";
import {
  BACKOFFICE_ORIGIN,
  openBackofficeSession,
  SESSION_NOON,
} from "../test-support/backoffice-session.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerRegistersPointsOfSaleListRoute } from "./registers-points-of-sale-list-route.js";

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
  registerRegistersPointsOfSaleListRoute(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => SESSION_NOON,
  });
});

afterEach(async () => {
  await app.close();
});

function listPointsOfSale(headers: Record<string, string>) {
  return app.inject({ method: "GET", url: "/registers/points-of-sale", headers });
}

describe("GET /registers/points-of-sale", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await listPointsOfSale({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects a user holding only the permission to enroll registers with 403 forbidden", async () => {
    const session = await openBackofficeSession(db, {
      now: SESSION_NOON,
      locationId: await seededLocationId(db),
      permissionKeys: ["enroll_register_devices"],
    });

    const response = await listPointsOfSale(session.headers);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("lists the session's branch registers by name, with no point of sale for one never configured, and no other branch's register", async () => {
    const locationId = await seededLocationId(db);
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    const [fiscalAddress] = await db
      .insert(fiscalAddresses)
      .values({ name: "Deposito Central", streetAddress: "Calle Ficticia 123, CABA" })
      .returning({ id: fiscalAddresses.id });
    if (!otherLocation || !fiscalAddress) {
      throw new Error(
        "test setup: seeding the other location or the fiscal address returned no row",
      );
    }
    const [configured, neverConfigured] = await db
      .insert(registers)
      .values([
        { locationId, name: "Caja 2" },
        { locationId, name: "Caja 1" },
        { locationId: otherLocation.id, name: "Caja 3" },
      ])
      .returning({ id: registers.id });
    if (!configured || !neverConfigured) {
      throw new Error("test setup: seeding the registers returned no row");
    }
    const session = await openBackofficeSession(db, {
      now: SESSION_NOON,
      locationId,
      permissionKeys: ["change_fiscal_configuration"],
      passkeyAuthorized: false,
    });
    await db
      .insert(pointOfSaleClaims)
      .values({ pointOfSaleNumber: 7, registerId: configured.id, claimedBy: session.userId });
    await db.insert(registerPointsOfSale).values({
      registerId: configured.id,
      pointOfSaleNumber: 7,
      fiscalAddressId: fiscalAddress.id,
      version: 1,
    });

    const response = await listPointsOfSale(session.headers);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      {
        register_id: neverConfigured.id,
        register_name: "Caja 1",
        point_of_sale_number: null,
        fiscal_address_id: null,
        version: 0,
      },
      {
        register_id: configured.id,
        register_name: "Caja 2",
        point_of_sale_number: 7,
        fiscal_address_id: fiscalAddress.id,
        version: 1,
      },
    ]);
  });
});
