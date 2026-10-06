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
import { registerFiscalAddressCreationRoute } from "./fiscal-address-creation-route.js";

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
  registerFiscalAddressCreationRoute(app, {
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

function createFiscalAddress(
  payload: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return app.inject({ method: "POST", url: "/fiscal-addresses", headers, payload });
}

const body = { name: "Deposito Central", street_address: "Calle Ficticia 123, CABA" };

describe("POST /fiscal-addresses", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await createFiscalAddress(body, { origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own, creating nothing", async () => {
    const session = await sessionWith(["change_fiscal_configuration"]);

    const response = await createFiscalAddress(body, {
      ...session.headers,
      origin: "https://attacker.example",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    expect(await db.select().from(fiscalAddresses)).toEqual([]);
  });

  it("rejects a user without the change_fiscal_configuration permission with 403 forbidden, creating nothing", async () => {
    const session = await sessionWith(["sell_and_charge"]);

    const response = await createFiscalAddress(body, session.headers);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    expect(await db.select().from(fiscalAddresses)).toEqual([]);
  });

  it("returns 401 authorization_required and creates nothing without a recent passkey", async () => {
    const session = await sessionWith(["change_fiscal_configuration"], false);

    const response = await createFiscalAddress(body, session.headers);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authorization_required" });
    expect(await db.select().from(fiscalAddresses)).toEqual([]);
  });

  it("answers a body that does not match its shape with 400 validation_failed, before asking for a passkey", async () => {
    const session = await sessionWith(["change_fiscal_configuration"], false);

    const response = await createFiscalAddress({ ...body, name: "   " }, session.headers);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "name" }],
    });
  });

  it("creates the fiscal address, trimmed, and answers it at version 1, audited under the actor", async () => {
    const session = await sessionWith(["change_fiscal_configuration"]);

    const response = await createFiscalAddress(
      { name: "  Deposito Central ", street_address: " Calle Ficticia 123, CABA " },
      session.headers,
    );

    expect(response.statusCode).toBe(201);
    const created = response.json();
    expect(created).toEqual({ id: expect.any(String), ...body, version: 1 });
    expect(await db.select().from(fiscalAddresses)).toMatchObject([
      { id: created.id, ...{ name: body.name } },
    ]);
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.entityId, created.id));
    expect(entry).toMatchObject({
      entity: "fiscal_address",
      actorId: session.userId,
      at: SESSION_NOON,
    });
  });

  it("answers 409 fiscal_address_name_taken for a name already used in any letter case, creating nothing", async () => {
    await db.insert(fiscalAddresses).values({ name: "Deposito Central", streetAddress: "Otra 1" });
    const session = await sessionWith(["change_fiscal_configuration"]);

    const response = await createFiscalAddress(
      { ...body, name: "DEPOSITO CENTRAL" },
      session.headers,
    );

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: "fiscal_address_name_taken",
      details: [{ field: "name" }],
    });
    expect(await db.select().from(fiscalAddresses)).toHaveLength(1);
  });
});
