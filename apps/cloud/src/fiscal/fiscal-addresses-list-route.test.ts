import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fiscalAddresses } from "../platform/db/schema.js";
import {
  BACKOFFICE_ORIGIN,
  openBackofficeSession,
  SESSION_NOON,
} from "../test-support/backoffice-session.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerFiscalAddressesListRoute } from "./fiscal-addresses-list-route.js";

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
  registerFiscalAddressesListRoute(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => SESSION_NOON,
  });
});

afterEach(async () => {
  await app.close();
});

describe("GET /fiscal-addresses", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/fiscal-addresses",
      headers: { origin: BACKOFFICE_ORIGIN },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects a user without the change_fiscal_configuration permission with 403 forbidden", async () => {
    const session = await openBackofficeSession(db, {
      locationId: await seededLocationId(db),
      permissionKeys: ["sell_and_charge"],
    });

    const response = await app.inject({
      method: "GET",
      url: "/fiscal-addresses",
      headers: session.headers,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("lists every fiscal address by name, without asking for a recent passkey", async () => {
    await db.insert(fiscalAddresses).values([
      { name: "Sucursal Sur", streetAddress: "Calle Ficticia 1, CABA" },
      { name: "Deposito Central", streetAddress: "Calle Ficticia 2, CABA" },
    ]);
    const session = await openBackofficeSession(db, {
      locationId: await seededLocationId(db),
      permissionKeys: ["change_fiscal_configuration"],
      passkeyAuthorized: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/fiscal-addresses",
      headers: session.headers,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      {
        id: expect.any(String),
        name: "Deposito Central",
        street_address: "Calle Ficticia 2, CABA",
        version: 1,
      },
      {
        id: expect.any(String),
        name: "Sucursal Sur",
        street_address: "Calle Ficticia 1, CABA",
        version: 1,
      },
    ]);
  });

  it("lists nothing while no fiscal address exists", async () => {
    const session = await openBackofficeSession(db, {
      locationId: await seededLocationId(db),
      permissionKeys: ["change_fiscal_configuration"],
    });

    const response = await app.inject({
      method: "GET",
      url: "/fiscal-addresses",
      headers: session.headers,
    });

    expect(response.json()).toEqual([]);
  });
});
