import { registerRevocationSchema } from "@purosur/contracts";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  alerts,
  auditLog,
  registerInstallations,
  registerSnapshotKeys,
  registers,
  userPins,
} from "../platform/db/schema.js";
import { registerRouteAccess } from "../sessions/route-access.js";
import {
  BACKOFFICE_ORIGIN,
  openBackofficeSession,
  SESSION_NOON,
} from "../test-support/backoffice-session.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import { registerRegisterRevocationRoute } from "./register-revocation-route.js";
import { insertEnrolledInstallation } from "./test-support/enrolled-installation.js";
import {
  insertFirstKeys,
  insertOtherLocation,
  insertUserWithPin,
} from "./test-support/lost-register-revocation-fixtures.js";

const REVOKE_PERMISSION = "revoke_register_devices";
const UNKNOWN_REGISTER_ID = "7d9b1f0e-3c52-4a8e-9d41-0b6f2e8a5c13";

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
  registerRegisterRevocationRoute(app, {
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
  await insertFirstKeys(db, installation.registerId);
  await insertUserWithPin(db, { firstName: "Bea", locationId: installation.locationId });
  const session = await openBackofficeSession(db, {
    now: SESSION_NOON,
    locationId: installation.locationId,
    permissionKeys: options.permissionKeys ?? [REVOKE_PERMISSION],
    passkeyAuthorized: options.passkeyAuthorized ?? true,
  });
  return { ...installation, session };
}

function revoke(registerId: string, headers: Record<string, string>) {
  return app.inject({ method: "POST", url: `/registers/${registerId}/revocations`, headers });
}

async function nothingRevoked(deviceId: string, registerId: string) {
  const [installation] = await db
    .select({ revokedAt: registerInstallations.revokedAt })
    .from(registerInstallations)
    .where(eq(registerInstallations.id, deviceId));
  expect(installation?.revokedAt).toBeNull();
  expect(
    await db
      .select()
      .from(registerSnapshotKeys)
      .where(eq(registerSnapshotKeys.registerId, registerId)),
  ).toHaveLength(1);
  expect(await db.select().from(alerts)).toEqual([]);
}

describe("POST /registers/:id/revocations", () => {
  it("answers 401 unauthenticated without a session", async () => {
    const response = await revoke(UNKNOWN_REGISTER_ID, { origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own, revoking nothing", async () => {
    const { registerId, deviceId, session } = await setUp();

    const response = await revoke(registerId, {
      ...session.headers,
      origin: "https://attacker.example",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    await nothingRevoked(deviceId, registerId);
  });

  it("answers 403 forbidden to a user without the revoke_register_devices permission, revoking nothing", async () => {
    const { registerId, deviceId, session } = await setUp({ permissionKeys: ["sell_and_charge"] });

    const response = await revoke(registerId, session.headers);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    await nothingRevoked(deviceId, registerId);
  });

  it("answers 400 validation_failed naming id for a malformed id", async () => {
    const { session } = await setUp();

    const response = await revoke("not-a-uuid", session.headers);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "id" }],
    });
  });

  it("answers 401 authorization_required without a recent passkey authorization, revoking nothing", async () => {
    const { registerId, deviceId, session } = await setUp({ passkeyAuthorized: false });

    const response = await revoke(registerId, session.headers);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authorization_required" });
    await nothingRevoked(deviceId, registerId);
  });

  it("checks the passkey authorization before it looks for the register", async () => {
    const { session } = await setUp({ passkeyAuthorized: false });

    const response = await revoke(UNKNOWN_REGISTER_ID, session.headers);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authorization_required" });
  });

  it("answers 404 not_found for a register that does not exist", async () => {
    const { session } = await setUp();

    const response = await revoke(UNKNOWN_REGISTER_ID, session.headers);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
  });

  it("answers 404 not_found for another branch's register, revoking nothing", async () => {
    const { session } = await setUp();
    const otherBranchId = await insertOtherLocation(db);
    const other = await insertEnrolledInstallation(db, {
      now: SESSION_NOON,
      registerName: "Caja de otra sucursal",
    });
    await db
      .update(registers)
      .set({ locationId: otherBranchId })
      .where(eq(registers.id, other.registerId));

    const response = await revoke(other.registerId, session.headers);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
    const [installation] = await db
      .select({ revokedAt: registerInstallations.revokedAt })
      .from(registerInstallations)
      .where(eq(registerInstallations.id, other.deviceId));
    expect(installation?.revokedAt).toBeNull();
  });

  it("answers 409 no_active_installation when the register's installation is already revoked", async () => {
    const { registerId, session } = await setUp();
    await revoke(registerId, session.headers);

    const response = await revoke(registerId, session.headers);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "no_active_installation" });
  });

  it("revokes the installation and answers when, rotating the keys and resetting the branch's PINs", async () => {
    const { registerId, deviceId, session } = await setUp();

    const response = await revoke(registerId, session.headers);

    expect(response.statusCode).toBe(200);
    expect(registerRevocationSchema.parse(response.json())).toEqual({
      revoked_at: SESSION_NOON.toISOString(),
    });
    const [installation] = await db
      .select({
        revokedAt: registerInstallations.revokedAt,
        revocationReason: registerInstallations.revocationReason,
      })
      .from(registerInstallations)
      .where(eq(registerInstallations.id, deviceId));
    expect(installation).toEqual({ revokedAt: SESSION_NOON, revocationReason: "lost_or_stolen" });
    expect(
      await db
        .select()
        .from(registerSnapshotKeys)
        .where(eq(registerSnapshotKeys.registerId, registerId)),
    ).toHaveLength(2);
    expect(await db.select().from(alerts).where(eq(alerts.scope, registerId))).toHaveLength(1);
    expect(await db.select().from(userPins)).toEqual([]);
  });

  it("audits the revocation with the person who made it", async () => {
    const { registerId, deviceId, session } = await setUp();

    await revoke(registerId, session.headers);

    const [row] = await db
      .select({ actorId: auditLog.actorId, newValue: auditLog.newValue })
      .from(auditLog)
      .where(eq(auditLog.entityId, deviceId));
    expect(row).toEqual({
      actorId: session.userId,
      newValue: {
        register_id: registerId,
        revoked_at: SESSION_NOON.toISOString(),
        revocation_reason: "lost_or_stolen",
      },
    });
  });
});
