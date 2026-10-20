import { bitlockerRecoveryKeySchema } from "@purosur/contracts";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  auditLog,
  registerInstallationBitlockerKeys,
  registerInstallations,
  registers,
} from "../platform/db/schema.js";
import { registerRouteAccess } from "../sessions/route-access.js";
import {
  BACKOFFICE_ORIGIN,
  openBackofficeSession,
  SESSION_NOON,
} from "../test-support/backoffice-session.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import { registerBitlockerRecoveryKeyRoute } from "./bitlocker-recovery-key-route.js";
import { insertEnrolledInstallation } from "./test-support/enrolled-installation.js";
import { insertOtherLocation } from "./test-support/lost-register-revocation-fixtures.js";

const BITLOCKER_PERMISSION = "view_bitlocker_key";
const UNKNOWN_REGISTER_ID = "7d9b1f0e-3c52-4a8e-9d41-0b6f2e8a5c13";
const RECOVERY_KEY = "000011-000022-000033-000044-000055-000066-000077-000088";
const KEY_IDENTIFIER = "8F3A2C1D";
const BODY = { recovery_key: RECOVERY_KEY, key_identifier: KEY_IDENTIFIER };

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
  registerRouteAccess(app);
  registerBitlockerRecoveryKeyRoute(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    keysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
    now: () => SESSION_NOON,
  });
});

afterEach(async () => {
  await app.close();
});

async function setUp(options: { permissionKeys?: string[]; passkeyAuthorized?: boolean } = {}) {
  const installation = await insertEnrolledInstallation(db, { now: SESSION_NOON });
  const session = await openBackofficeSession(db, {
    now: SESSION_NOON,
    locationId: installation.locationId,
    permissionKeys: options.permissionKeys ?? [BITLOCKER_PERMISSION],
    passkeyAuthorized: options.passkeyAuthorized ?? true,
  });
  return { ...installation, session };
}

function load(registerId: string, headers: Record<string, string>, payload: object = BODY) {
  return app.inject({
    method: "POST",
    url: `/registers/${registerId}/bitlocker-recovery-key`,
    headers,
    payload,
  });
}

function consult(registerId: string, headers: Record<string, string>) {
  return app.inject({
    method: "POST",
    url: `/registers/${registerId}/bitlocker-recovery-key/consultations`,
    headers,
  });
}

async function storedKeys() {
  return db.select().from(registerInstallationBitlockerKeys);
}

async function auditRows() {
  return db.select().from(auditLog);
}

describe.each([
  ["loading the key", load],
  ["consulting the key", consult],
] as const)("%s", (_name, act) => {
  it("answers 401 unauthenticated without a session", async () => {
    const response = await act(UNKNOWN_REGISTER_ID, { origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const { registerId, session } = await setUp();

    const response = await act(registerId, {
      ...session.headers,
      origin: "https://attacker.example",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    expect(await storedKeys()).toEqual([]);
  });

  it("answers 403 forbidden to a user holding other permissions over the registers", async () => {
    const { registerId, session } = await setUp({
      permissionKeys: ["enroll_register_devices", "revoke_register_devices"],
    });

    const response = await act(registerId, session.headers);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    expect(await storedKeys()).toEqual([]);
    expect(await auditRows()).toEqual([]);
  });

  it("answers 400 validation_failed naming id for a malformed id", async () => {
    const { session } = await setUp();

    const response = await act("not-a-uuid", session.headers);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "id" }],
    });
  });

  it("answers 401 authorization_required without a recent passkey authorization", async () => {
    const { registerId, session } = await setUp({ passkeyAuthorized: false });

    const response = await act(registerId, session.headers);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authorization_required" });
    expect(await storedKeys()).toEqual([]);
    expect(await auditRows()).toEqual([]);
  });

  it("checks the passkey authorization before it looks for the register", async () => {
    const { session } = await setUp({ passkeyAuthorized: false });

    const response = await act(UNKNOWN_REGISTER_ID, session.headers);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authorization_required" });
  });

  it("answers 404 not_found for a register that does not exist", async () => {
    const { session } = await setUp();

    const response = await act(UNKNOWN_REGISTER_ID, session.headers);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
  });

  it("answers 404 not_found for another branch's register", async () => {
    const { registerId, session } = await setUp();
    await db
      .update(registers)
      .set({ locationId: await insertOtherLocation(db) })
      .where(eq(registers.id, registerId));

    const response = await act(registerId, session.headers);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
    expect(await storedKeys()).toEqual([]);
  });

  it("answers 409 no_current_installation for a register whose installation was revoked", async () => {
    const { registerId, deviceId, session } = await setUp();
    await db
      .update(registerInstallations)
      .set({ revokedAt: SESSION_NOON })
      .where(eq(registerInstallations.id, deviceId));

    const response = await act(registerId, session.headers);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "no_current_installation" });
  });
});

describe("POST /registers/:id/bitlocker-recovery-key", () => {
  it("answers 400 validation_failed for a malformed key, without repeating it", async () => {
    const { registerId, session } = await setUp();
    const malformed = "000011-000022-000033-000044-000055-000066-000077-000089";

    const response = await load(registerId, session.headers, {
      ...BODY,
      recovery_key: malformed,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "recovery_key" }],
    });
    expect(response.body).not.toContain(malformed);
    expect(await storedKeys()).toEqual([]);
  });

  it("answers 400 validation_failed for a malformed identifier", async () => {
    const { registerId, session } = await setUp();

    const response = await load(registerId, session.headers, { ...BODY, key_identifier: "xyz" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ details: [{ field: "key_identifier" }] });
  });

  it("answers 201 and stores the key sealed for the installation in service", async () => {
    const { registerId, deviceId, session } = await setUp();

    const response = await load(registerId, session.headers);

    expect(response.statusCode).toBe(201);
    expect(response.body).not.toContain(RECOVERY_KEY);
    const [row] = await storedKeys();
    expect(row).toMatchObject({
      installationId: deviceId,
      keyIdentifier: KEY_IDENTIFIER,
      loadedAt: SESSION_NOON,
      loadedBy: session.userId,
    });
    expect(row?.sealedKey).not.toContain("000011");
  });

  it("answers 409 already_loaded for an installation that has its key", async () => {
    const { registerId, session } = await setUp();
    await load(registerId, session.headers);

    const response = await load(registerId, session.headers, {
      ...BODY,
      recovery_key: "000099-000099-000099-000099-000099-000099-000099-000099",
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "already_loaded" });
    expect(await storedKeys()).toHaveLength(1);
  });

  it("audits the load with the person who made it, without the key", async () => {
    const { registerId, deviceId, session } = await setUp();

    await load(registerId, session.headers);

    const rows = await auditRows();
    expect(rows).toEqual([
      expect.objectContaining({
        entity: "register_installation_bitlocker_key",
        entityId: deviceId,
        actorId: session.userId,
        newValue: { register_id: registerId, action: "loaded" },
      }),
    ]);
    expect(JSON.stringify(rows)).not.toContain("000011");
  });
});

describe("POST /registers/:id/bitlocker-recovery-key/consultations", () => {
  it("answers 409 not_loaded for an installation without a key", async () => {
    const { registerId, session } = await setUp();

    const response = await consult(registerId, session.headers);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "not_loaded" });
    expect(await auditRows()).toEqual([]);
  });

  it("answers 200 with the key and its identifier, never cached", async () => {
    const { registerId, session } = await setUp();
    await load(registerId, session.headers);

    const response = await consult(registerId, session.headers);

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(bitlockerRecoveryKeySchema.parse(response.json())).toEqual(BODY);
  });

  it("audits the consultation with the person who made it, without the key", async () => {
    const { registerId, deviceId, session } = await setUp();
    await load(registerId, session.headers);

    await consult(registerId, session.headers);

    const rows = await db.select().from(auditLog).where(eq(auditLog.entityId, deviceId));
    expect(rows).toHaveLength(2);
    expect(rows).toContainEqual(
      expect.objectContaining({
        actorId: session.userId,
        newValue: { register_id: registerId, action: "consulted" },
      }),
    );
    expect(JSON.stringify(rows)).not.toContain("000011");
  });
});
