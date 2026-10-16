import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditLog, registerSnapshotKeys } from "../platform/db/schema.js";
import { BACKOFFICE_ORIGIN, SESSION_NOON } from "../test-support/backoffice-session.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { keyStore } from "./test-support/key-store.js";
import {
  backupsSession,
  buildBackupsApp,
  insertRegisterWithKeys,
} from "./test-support/snapshot-backups-routes.js";

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
  app = buildBackupsApp(db);
});

afterEach(async () => {
  await app.close();
});

function rotate(registerId: string, headers: Record<string, string> = {}) {
  return app.inject({
    method: "POST",
    url: `/snapshot-backups/registers/${registerId}/key-rotations`,
    headers,
  });
}

async function keyVersionsOf(registerId: string): Promise<number[]> {
  const rows = await db
    .select({ version: registerSnapshotKeys.version })
    .from(registerSnapshotKeys)
    .where(eq(registerSnapshotKeys.registerId, registerId));
  return rows.map((row) => row.version).sort();
}

describe("POST /snapshot-backups/registers/:registerId/key-rotations", () => {
  it("answers 401 unauthenticated without a session", async () => {
    const response = await rotate(UNKNOWN_REGISTER_ID, { origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own, rotating nothing", async () => {
    const register = await insertRegisterWithKeys(db, { name: "Caja 1", keyVersions: [1] });
    const session = await backupsSession(db);

    const response = await rotate(register.registerId, {
      ...session.headers,
      origin: "https://attacker.example",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    expect(await keyVersionsOf(register.registerId)).toEqual([1]);
  });

  it("answers 403 forbidden to a user without the backups permission, rotating nothing", async () => {
    const register = await insertRegisterWithKeys(db, { name: "Caja 1", keyVersions: [1] });
    const session = await backupsSession(db, { permissionKeys: ["sell_and_charge"] });

    const response = await rotate(register.registerId, session.headers);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    expect(await keyVersionsOf(register.registerId)).toEqual([1]);
  });

  it("answers 401 authorization_required without a recent passkey, before looking the register up", async () => {
    const register = await insertRegisterWithKeys(db, { name: "Caja 1", keyVersions: [1] });
    const session = await backupsSession(db, { passkeyAuthorized: false });

    const unknown = await rotate(UNKNOWN_REGISTER_ID, session.headers);
    const known = await rotate(register.registerId, session.headers);

    expect(unknown.statusCode).toBe(401);
    expect(unknown.json()).toMatchObject({ code: "authorization_required" });
    expect(known.statusCode).toBe(401);
    expect(await keyVersionsOf(register.registerId)).toEqual([1]);
  });

  it("answers 400 validation_failed for an id that is not a record id", async () => {
    const session = await backupsSession(db);

    const response = await rotate("not-an-id", session.headers);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });

  it("answers 404 register_not_found for a register that does not exist", async () => {
    const session = await backupsSession(db);

    const response = await rotate(UNKNOWN_REGISTER_ID, session.headers);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "register_not_found" });
  });

  it("answers 409 no_key_yet for a register that was never handed a key, recording nothing", async () => {
    const register = await insertRegisterWithKeys(db, { name: "Caja 1", keyVersions: [] });
    const session = await backupsSession(db);

    const response = await rotate(register.registerId, session.headers);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "no_key_yet" });
    expect(await keyVersionsOf(register.registerId)).toEqual([]);
  });

  it("records the next key version sealed, answers it, and audits the rotation under the actor", async () => {
    const register = await insertRegisterWithKeys(db, { name: "Caja 1", keyVersions: [1, 2] });
    const session = await backupsSession(db);

    const response = await rotate(register.registerId, session.headers);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ key_version: 3 });
    expect(await keyVersionsOf(register.registerId)).toEqual([1, 2, 3]);
    const held = await keyStore(db).transaction((tx) => tx.lockRegisterKeys(register.registerId));
    const rotated = held.snapshotKeys.find((key) => key.version === 3);
    expect(rotated?.key).toEqual(expect.any(String));
    expect(rotated?.key).not.toBe("fictional-key-2");
    expect(
      await db.select().from(auditLog).where(eq(auditLog.entityId, register.registerId)),
    ).toMatchObject([
      {
        entity: "register_snapshot_key",
        actorId: session.userId,
        previousValue: { version: 2 },
        newValue: { version: 3 },
        at: SESSION_NOON,
      },
    ]);
  });
});
