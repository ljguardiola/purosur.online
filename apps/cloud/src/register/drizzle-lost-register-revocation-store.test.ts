import { enrollInstallation } from "@purosur/domain/register/use-cases";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  alerts,
  auditLog,
  changes,
  registerContingencyTicketKeys,
  registerEnrollmentCodes,
  registerInstallations,
  registerSnapshotGenerations,
  registerSnapshotKeys,
  userPins,
  users,
} from "../platform/db/schema.js";
import { hashSecretCode } from "../platform/secret-code.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { issueDeviceToken } from "./device-token.js";
import { generateInstallationKey } from "./installation-key.js";
import { registerEnrollmentCodeMatches } from "./register-enrollment-code.js";
import { insertEnrolledInstallation } from "./test-support/enrolled-installation.js";
import { keyStore } from "./test-support/key-store.js";
import {
  insertFirstKeys,
  insertOtherLocation,
  insertUserWithPin,
  REVOKED_AT,
  revokeRegister,
} from "./test-support/lost-register-revocation-fixtures.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];

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
  const installation = await insertEnrolledInstallation(db, { now: REVOKED_AT });
  const actorId = await insertUserWithPin(db, {
    firstName: "Ada",
    locationId: installation.locationId,
  });
  const keys = await insertFirstKeys(db, installation.registerId);
  return { ...installation, actorId, keys };
}

describe("DrizzleLostRegisterRevocationStore", () => {
  it("revokes the installation in service as lost or stolen", async () => {
    const { registerId, locationId, deviceId, actorId } = await setUp();

    const outcome = await revokeRegister(db, { branchId: locationId, registerId, actorId });

    expect(outcome).toEqual({
      kind: "revoked",
      deviceId,
      revokedAt: REVOKED_AT,
      snapshotKeyVersion: 2,
      contingencyTicketKeyVersion: 2,
    });
    expect(
      await db
        .select({
          revokedAt: registerInstallations.revokedAt,
          revocationReason: registerInstallations.revocationReason,
        })
        .from(registerInstallations)
        .where(eq(registerInstallations.id, deviceId)),
    ).toEqual([{ revokedAt: REVOKED_AT, revocationReason: "lost_or_stolen" }]);
  });

  it("does not find a register of another branch, changing nothing", async () => {
    const { registerId, actorId, deviceId } = await setUp();
    const otherBranchId = await insertOtherLocation(db);

    const outcome = await revokeRegister(db, { branchId: otherBranchId, registerId, actorId });

    expect(outcome).toEqual({ kind: "register_not_found" });
    const [installation] = await db
      .select({ revokedAt: registerInstallations.revokedAt })
      .from(registerInstallations)
      .where(eq(registerInstallations.id, deviceId));
    expect(installation?.revokedAt).toBeNull();
    expect(await db.select().from(registerSnapshotKeys)).toHaveLength(1);
  });

  it("answers no active installation for a register whose installation was already revoked", async () => {
    const { registerId, locationId, actorId } = await setUp();
    await revokeRegister(db, { branchId: locationId, registerId, actorId });

    const outcome = await revokeRegister(db, { branchId: locationId, registerId, actorId });

    expect(outcome).toEqual({ kind: "no_active_installation" });
    expect(await db.select().from(registerSnapshotKeys)).toHaveLength(2);
    expect(await db.select().from(alerts)).toHaveLength(1);
  });

  it("adds a new version of both keys and never deletes the retired ones", async () => {
    const { registerId, locationId, actorId, keys } = await setUp();

    await revokeRegister(db, { branchId: locationId, registerId, actorId });

    const held = await keyStore(db).transaction((tx) => tx.lockRegisterKeys(registerId));
    expect(held.snapshotKeys.map(({ version }) => version).sort()).toEqual([1, 2]);
    expect(held.contingencyTicketKeys.map(({ version }) => version).sort()).toEqual([1, 2]);
    expect(held.snapshotKeys.find(({ version }) => version === 1)?.key).toBe(keys.snapshotKey);
    expect(held.contingencyTicketKeys.find(({ version }) => version === 1)?.key).toBe(
      keys.contingencyTicketKey,
    );
    expect(held.snapshotKeys.find(({ version }) => version === 2)?.key).not.toBe(keys.snapshotKey);
    expect(await db.select().from(registerContingencyTicketKeys)).toHaveLength(2);
  });

  it("hands the next installation the new keys, and the retired snapshot key a stored snapshot still needs", async () => {
    const { registerId, locationId, deviceId, actorId, keys } = await setUp();
    await db.insert(registerSnapshotGenerations).values({
      id: "0f8fad5b-d9cb-469f-a165-70867728950e",
      registerId,
      deviceId,
      createdAt: REVOKED_AT,
      size: 4096,
      sha256: "ab".repeat(32),
      keyVersion: 1,
      status: "verified",
    });
    await revokeRegister(db, { branchId: locationId, registerId, actorId });
    const code = "P4NX7KWE2QRT6MZD";
    await db.insert(registerEnrollmentCodes).values({
      registerId,
      codeLookup: code.slice(0, 4),
      codeHash: hashSecretCode(code),
      issuedAt: REVOKED_AT,
      expiresAt: new Date(REVOKED_AT.getTime() + 15 * 60 * 1000),
    });

    const outcome = await enrollInstallation(
      {
        store: keyStore(db),
        clock: { now: () => REVOKED_AT },
        tokens: { issue: issueDeviceToken },
        codes: { matches: registerEnrollmentCodeMatches },
        keys: { generate: generateInstallationKey },
      },
      {
        code,
        sourceAddress: "203.0.113.7",
        hostname: "CAJA-NUEVA",
        windowsVersion: "Windows 11 Pro 10.0.26100",
      },
    );

    if (outcome.kind !== "enrolled") {
      throw new Error(`expected an enrollment, got ${outcome.kind}`);
    }
    expect(outcome.keys.snapshotKeyVersions.map(({ version }) => version)).toEqual([1, 2]);
    expect(outcome.keys.snapshotKeyVersions[0]?.key).toBe(keys.snapshotKey);
    expect(outcome.keys.contingencyTicketKey.version).toBe(2);
    expect(outcome.keys.contingencyTicketKey.key).not.toBe(keys.contingencyTicketKey);
  });

  it("removes the PIN of every user of the branch and leaves other branches' PINs alone", async () => {
    const { registerId, locationId, actorId } = await setUp();
    const cashier = await insertUserWithPin(db, { firstName: "Bea", locationId });
    const withoutPin = await insertUserWithPin(db, {
      firstName: "Caro",
      locationId,
      withPin: false,
    });
    const otherBranchId = await insertOtherLocation(db);
    const elsewhere = await insertUserWithPin(db, { firstName: "Dora", locationId: otherBranchId });

    await revokeRegister(db, { branchId: locationId, registerId, actorId });

    const pinned = (await db.select({ userId: userPins.userId }).from(userPins)).map(
      ({ userId }) => userId,
    );
    expect(pinned).toEqual([elsewhere]);
    expect(pinned).not.toContain(cashier);
    expect(pinned).not.toContain(withoutPin);
  });

  it("resets each PIN as an ordinary reset does: the user's version rises and the change feed notes it", async () => {
    const { registerId, locationId, actorId } = await setUp();
    const cashier = await insertUserWithPin(db, { firstName: "Bea", locationId });
    const withoutPin = await insertUserWithPin(db, {
      firstName: "Caro",
      locationId,
      withPin: false,
    });

    await revokeRegister(db, { branchId: locationId, registerId, actorId });

    const versions = await db.select({ id: users.id, version: users.version }).from(users);
    expect(versions.find(({ id }) => id === cashier)?.version).toBe(2);
    expect(versions.find(({ id }) => id === withoutPin)?.version).toBe(1);
    const feed = await db
      .select({
        entity: changes.entity,
        entityId: changes.entityId,
        version: changes.version,
        op: changes.op,
        locationId: changes.locationId,
      })
      .from(changes)
      .where(eq(changes.entityId, cashier));
    expect(feed).toEqual([
      { entity: "user", entityId: cashier, version: 2, op: "update", locationId },
    ]);
  });

  it("audits each PIN reset with its cause and the actor, only for users who had a PIN", async () => {
    const { registerId, locationId, actorId } = await setUp();
    const cashier = await insertUserWithPin(db, { firstName: "Bea", locationId });
    await insertUserWithPin(db, { firstName: "Caro", locationId, withPin: false });

    await revokeRegister(db, { branchId: locationId, registerId, actorId });

    const rows = await db
      .select({
        entityId: auditLog.entityId,
        actorId: auditLog.actorId,
        newValue: auditLog.newValue,
        at: auditLog.at,
      })
      .from(auditLog)
      .where(eq(auditLog.entity, "user"));
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(
      expect.arrayContaining([
        {
          entityId: cashier,
          actorId,
          newValue: { pin_reset_required_by: "register_revocation" },
          at: REVOKED_AT,
        },
        {
          entityId: actorId,
          actorId,
          newValue: { pin_reset_required_by: "register_revocation" },
          at: REVOKED_AT,
        },
      ]),
    );
  });

  it("opens an alert that tells the installation was revoked", async () => {
    const { registerId, locationId, deviceId, actorId } = await setUp();

    await revokeRegister(db, { branchId: locationId, registerId, actorId });

    expect(await db.select().from(alerts)).toEqual([
      expect.objectContaining({
        kind: "register_enrolled",
        scope: registerId,
        locationId: null,
        detail: {
          change: "revoked",
          deviceId,
          hostname: "CAJA-MOSTRADOR",
          windowsVersion: "Windows 11 Pro 10.0.26100",
        },
        openedAt: REVOKED_AT,
        resolvedAt: null,
      }),
    ]);
  });

  it("audits the revocation and both key rotations with the actor", async () => {
    const { registerId, locationId, deviceId, actorId } = await setUp();

    await revokeRegister(db, { branchId: locationId, registerId, actorId });

    const rowOf = async (entity: string) => {
      const [row] = await db
        .select({
          entityId: auditLog.entityId,
          actorId: auditLog.actorId,
          at: auditLog.at,
          previousValue: auditLog.previousValue,
          newValue: auditLog.newValue,
        })
        .from(auditLog)
        .where(and(eq(auditLog.entity, entity)));
      return row;
    };
    expect(await rowOf("register_installation")).toEqual({
      entityId: deviceId,
      actorId,
      at: REVOKED_AT,
      previousValue: { revoked_at: null, revocation_reason: null },
      newValue: {
        register_id: registerId,
        revoked_at: REVOKED_AT.toISOString(),
        revocation_reason: "lost_or_stolen",
      },
    });
    expect(await rowOf("register_snapshot_key")).toEqual({
      entityId: registerId,
      actorId,
      at: REVOKED_AT,
      previousValue: { version: 1 },
      newValue: { version: 2 },
    });
    expect(await rowOf("register_contingency_ticket_key")).toEqual({
      entityId: registerId,
      actorId,
      at: REVOKED_AT,
      previousValue: { version: 1 },
      newValue: { version: 2 },
    });
  });
});
