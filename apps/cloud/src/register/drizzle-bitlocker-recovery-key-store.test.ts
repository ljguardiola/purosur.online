import {
  consultBitlockerRecoveryKey,
  loadBitlockerRecoveryKey,
} from "@purosur/domain/register/use-cases";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  auditLog,
  registerInstallationBitlockerKeys,
  registerInstallations,
} from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import { DrizzleBitlockerRecoveryKeyStore } from "./drizzle-bitlocker-recovery-key-store.js";
import { installationKeyCipher } from "./installation-key-cipher.js";
import { insertEnrolledInstallation } from "./test-support/enrolled-installation.js";
import {
  insertOtherLocation,
  insertUserWithPin,
} from "./test-support/lost-register-revocation-fixtures.js";

const LOADED_AT = new Date("2026-10-19T12:00:00.000Z");
const CONSULTED_AT = new Date("2026-10-20T09:30:00.000Z");
const RECOVERY_KEY = "000011-000022-000033-000044-000055-000066-000077-000088";
const KEY_IDENTIFIER = "8F3A2C1D";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
const cipher = installationKeyCipher(TEST_INSTALLATION_KEYS_ENCRYPTION_KEY);

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

async function setUp() {
  const installation = await insertEnrolledInstallation(db, { now: LOADED_AT });
  const actorId = await insertUserWithPin(db, {
    firstName: "Ada",
    locationId: installation.locationId,
  });
  return { ...installation, actorId };
}

function load(input: {
  branchId: string;
  registerId: string;
  actorId: string;
  recoveryKey?: string;
}) {
  return loadBitlockerRecoveryKey(
    {
      store: new DrizzleBitlockerRecoveryKeyStore(db, cipher),
      clock: { now: () => LOADED_AT },
    },
    { recoveryKey: RECOVERY_KEY, keyIdentifier: KEY_IDENTIFIER, ...input },
  );
}

function consult(input: { branchId: string; registerId: string; actorId: string }) {
  return consultBitlockerRecoveryKey(
    {
      store: new DrizzleBitlockerRecoveryKeyStore(db, cipher),
      clock: { now: () => CONSULTED_AT },
    },
    input,
  );
}

describe("DrizzleBitlockerRecoveryKeyStore", () => {
  it("stores the key sealed to its installation, with its identifier in plain", async () => {
    const { registerId, locationId, deviceId, actorId } = await setUp();

    const outcome = await load({ branchId: locationId, registerId, actorId });

    expect(outcome).toEqual({ kind: "loaded", installationId: deviceId, loadedAt: LOADED_AT });
    const [row] = await db.select().from(registerInstallationBitlockerKeys);
    expect(row).toEqual({
      installationId: deviceId,
      sealedKey: expect.any(String),
      keyIdentifier: KEY_IDENTIFIER,
      loadedAt: LOADED_AT,
      loadedBy: actorId,
    });
    expect(row?.sealedKey).not.toContain(RECOVERY_KEY);
    expect(row?.sealedKey).not.toContain("000011");
    expect(cipher.open(row?.sealedKey ?? "", `bitlocker-recovery-key:${deviceId}`)).toBe(
      RECOVERY_KEY,
    );
  });

  it("opens the stored key back when it is consulted", async () => {
    const { registerId, locationId, deviceId, actorId } = await setUp();
    await load({ branchId: locationId, registerId, actorId });

    expect(await consult({ branchId: locationId, registerId, actorId })).toEqual({
      kind: "consulted",
      installationId: deviceId,
      recoveryKey: RECOVERY_KEY,
      keyIdentifier: KEY_IDENTIFIER,
    });
  });

  it("does not open a sealed key copied to another installation", async () => {
    const first = await setUp();
    await load({
      branchId: first.locationId,
      registerId: first.registerId,
      actorId: first.actorId,
    });
    const second = await insertEnrolledInstallation(db, {
      now: LOADED_AT,
      registerName: "Caja 2",
    });
    await load({
      branchId: second.locationId,
      registerId: second.registerId,
      actorId: first.actorId,
      recoveryKey: "000099-000099-000099-000099-000099-000099-000099-000099",
    });
    const [firstRow] = await db
      .select({ sealedKey: registerInstallationBitlockerKeys.sealedKey })
      .from(registerInstallationBitlockerKeys)
      .where(eq(registerInstallationBitlockerKeys.installationId, first.deviceId));
    await db
      .update(registerInstallationBitlockerKeys)
      .set({ sealedKey: firstRow?.sealedKey ?? "" })
      .where(eq(registerInstallationBitlockerKeys.installationId, second.deviceId));

    await expect(
      consult({
        branchId: second.locationId,
        registerId: second.registerId,
        actorId: first.actorId,
      }),
    ).rejects.toThrow();
  });

  it("does not find a register of another branch, storing and auditing nothing", async () => {
    const { registerId, actorId } = await setUp();
    const otherBranchId = await insertOtherLocation(db);

    expect(await load({ branchId: otherBranchId, registerId, actorId })).toEqual({
      kind: "register_not_found",
    });
    expect(await consult({ branchId: otherBranchId, registerId, actorId })).toEqual({
      kind: "register_not_found",
    });
    expect(await db.select().from(registerInstallationBitlockerKeys)).toEqual([]);
    expect(await db.select().from(auditLog)).toEqual([]);
  });

  it("refuses a register whose installation was revoked", async () => {
    const { registerId, locationId, deviceId, actorId } = await setUp();
    await db
      .update(registerInstallations)
      .set({ revokedAt: LOADED_AT })
      .where(eq(registerInstallations.id, deviceId));

    expect(await load({ branchId: locationId, registerId, actorId })).toEqual({
      kind: "no_current_installation",
    });
    expect(await consult({ branchId: locationId, registerId, actorId })).toEqual({
      kind: "no_current_installation",
    });
    expect(await db.select().from(registerInstallationBitlockerKeys)).toEqual([]);
  });

  it("keeps the key of a revoked installation stored but offers nothing for the one that replaces it", async () => {
    const { registerId, locationId, deviceId, actorId } = await setUp();
    await load({ branchId: locationId, registerId, actorId });
    await db
      .update(registerInstallations)
      .set({ revokedAt: LOADED_AT })
      .where(eq(registerInstallations.id, deviceId));
    const replacement = await insertEnrolledInstallation(db, {
      now: LOADED_AT,
      existingRegisterId: registerId,
    });

    expect(await consult({ branchId: locationId, registerId, actorId })).toEqual({
      kind: "not_loaded",
    });
    expect(await load({ branchId: locationId, registerId, actorId })).toMatchObject({
      kind: "loaded",
      installationId: replacement.deviceId,
    });
    expect(await db.select().from(registerInstallationBitlockerKeys)).toHaveLength(2);
  });

  it("refuses a second load for the same installation, keeping the first key", async () => {
    const { registerId, locationId, actorId } = await setUp();
    await load({ branchId: locationId, registerId, actorId });
    const [before] = await db.select().from(registerInstallationBitlockerKeys);

    expect(
      await load({
        branchId: locationId,
        registerId,
        actorId,
        recoveryKey: "000099-000099-000099-000099-000099-000099-000099-000099",
      }),
    ).toEqual({ kind: "already_loaded" });
    expect(await db.select().from(registerInstallationBitlockerKeys)).toEqual([before]);
  });

  it("answers not loaded for an installation without a key", async () => {
    const { registerId, locationId, actorId } = await setUp();

    expect(await consult({ branchId: locationId, registerId, actorId })).toEqual({
      kind: "not_loaded",
    });
    expect(await db.select().from(auditLog)).toEqual([]);
  });

  it("audits the load and the consultation without the key or its identifier", async () => {
    const { registerId, locationId, deviceId, actorId } = await setUp();

    await load({ branchId: locationId, registerId, actorId });
    await consult({ branchId: locationId, registerId, actorId });

    const rows = await db
      .select({
        entity: auditLog.entity,
        entityId: auditLog.entityId,
        actorId: auditLog.actorId,
        previousValue: auditLog.previousValue,
        newValue: auditLog.newValue,
        at: auditLog.at,
      })
      .from(auditLog)
      .orderBy(auditLog.at);
    const audited = (action: string, at: Date) => ({
      entity: "register_installation_bitlocker_key",
      entityId: deviceId,
      actorId,
      previousValue: null,
      newValue: { register_id: registerId, action },
      at,
    });
    expect(rows).toEqual([audited("loaded", LOADED_AT), audited("consulted", CONSULTED_AT)]);
    expect(JSON.stringify(rows)).not.toContain("000011");
    expect(JSON.stringify(rows)).not.toContain(KEY_IDENTIFIER);
  });

  it("leaves no key behind when the work fails after the key is stored", async () => {
    const { deviceId, actorId } = await setUp();

    await expect(
      new DrizzleBitlockerRecoveryKeyStore(db, cipher).transaction(async (tx) => {
        await tx.storeRecoveryKey({
          installationId: deviceId,
          recoveryKey: RECOVERY_KEY,
          keyIdentifier: KEY_IDENTIFIER,
          loadedAt: LOADED_AT,
          loadedBy: actorId,
        });
        throw new Error("audit write failed");
      }),
    ).rejects.toThrow("audit write failed");
    expect(await db.select().from(registerInstallationBitlockerKeys)).toEqual([]);
  });
});
