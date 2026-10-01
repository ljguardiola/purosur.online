import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditLog, fiscalAddresses } from "../platform/db/schema.js";
import {
  BACKOFFICE_ORIGIN,
  type BackofficeSession,
  openBackofficeSession,
  SESSION_NOON,
} from "../test-support/backoffice-session.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerFiscalAddressEditRoute } from "./fiscal-address-edit-route.js";

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
  registerFiscalAddressEditRoute(app, {
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
    locationId: await seededLocationId(db),
    permissionKeys,
    passkeyAuthorized,
  });
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

function editFiscalAddress(
  id: string,
  payload: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return app.inject({ method: "PUT", url: `/fiscal-addresses/${id}`, headers, payload });
}

const body = { name: "Deposito Norte", street_address: "Avenida Inventada 45, CABA", version: 1 };

describe("PUT /fiscal-addresses/:id", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const id = await insertFiscalAddress();

    const response = await editFiscalAddress(id, body, { origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own, changing nothing", async () => {
    const id = await insertFiscalAddress();
    const session = await sessionWith(["change_fiscal_configuration"]);

    const response = await editFiscalAddress(id, body, {
      ...session.headers,
      origin: "https://attacker.example",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a user without the change_fiscal_configuration permission with 403 forbidden, changing nothing", async () => {
    const id = await insertFiscalAddress();
    const session = await sessionWith(["sell_and_charge"]);

    const response = await editFiscalAddress(id, body, session.headers);

    expect(response.statusCode).toBe(403);
    expect(await db.select().from(fiscalAddresses)).toMatchObject([{ name: "Deposito Central" }]);
  });

  it("returns 401 authorization_required and changes nothing without a recent passkey", async () => {
    const id = await insertFiscalAddress();
    const session = await sessionWith(["change_fiscal_configuration"], false);

    const response = await editFiscalAddress(id, body, session.headers);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authorization_required" });
    expect(await db.select().from(fiscalAddresses)).toMatchObject([{ name: "Deposito Central" }]);
  });

  it("answers a body that does not match its shape with 400 validation_failed", async () => {
    const id = await insertFiscalAddress();
    const session = await sessionWith(["change_fiscal_configuration"]);

    const response = await editFiscalAddress(id, { ...body, version: 0 }, session.headers);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "version" }],
    });
  });

  it.each(["7c9e6679-7425-40de-944b-e07fc1f90ae7", "not-a-uuid"])(
    "answers 404 not_found for the id %s",
    async (id) => {
      const session = await sessionWith(["change_fiscal_configuration"]);

      const response = await editFiscalAddress(id, body, session.headers);

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: "not_found" });
    },
  );

  it("edits the fiscal address, answering it at the next version, audited under the actor", async () => {
    const id = await insertFiscalAddress();
    const session = await sessionWith(["change_fiscal_configuration"]);

    const response = await editFiscalAddress(id, body, session.headers);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id,
      name: "Deposito Norte",
      street_address: "Avenida Inventada 45, CABA",
      version: 2,
    });
    const entries = await db.select().from(auditLog).where(eq(auditLog.entityId, id));
    expect(entries).toMatchObject([{ entity: "fiscal_address", actorId: session.userId }]);
  });

  it("answers the current fiscal address, unchanged, when the edit changes nothing", async () => {
    const id = await insertFiscalAddress();
    const session = await sessionWith(["change_fiscal_configuration"]);

    const response = await editFiscalAddress(
      id,
      { name: "Deposito Central", street_address: "Calle Ficticia 123, CABA", version: 1 },
      session.headers,
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id, version: 1 });
    expect(await db.select().from(auditLog)).toEqual([]);
  });

  it("answers 409 stale_version when the fiscal address changed since it was loaded", async () => {
    const id = await insertFiscalAddress();
    const session = await sessionWith(["change_fiscal_configuration"]);

    const response = await editFiscalAddress(id, { ...body, version: 3 }, session.headers);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "stale_version" });
  });

  it("answers 409 fiscal_address_name_taken for another fiscal address's name", async () => {
    const id = await insertFiscalAddress();
    await insertFiscalAddress("Deposito Norte");
    const session = await sessionWith(["change_fiscal_configuration"]);

    const response = await editFiscalAddress(
      id,
      { ...body, name: "DEPOSITO NORTE" },
      session.headers,
    );

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: "fiscal_address_name_taken",
      details: [{ field: "name" }],
    });
  });
});
