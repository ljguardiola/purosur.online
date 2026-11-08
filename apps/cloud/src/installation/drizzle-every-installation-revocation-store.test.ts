import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  alerts,
  auditLog,
  registerContingencyTicketKeys,
  registerInstallations,
  registerSnapshotKeys,
  userPins,
} from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import {
  revokeEveryRegister,
  seedActor,
  seedRegisterWithKeys,
} from "./test-support/every-installation-revocation-fixtures.js";
import { REVOKED_AT } from "./test-support/lost-register-revocation-fixtures.js";

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
  const actorId = await seedActor(db);
  const first = await seedRegisterWithKeys(db, { registerName: "Caja 1" });
  const second = await seedRegisterWithKeys(db, {
    registerName: "Caja 2",
    inOtherBranch: true,
  });
  return { actorId, first, second };
}

async function installationOf(deviceId: string) {
  const [installation] = await db
    .select({
      revokedAt: registerInstallations.revokedAt,
      revocationReason: registerInstallations.revocationReason,
    })
    .from(registerInstallations)
    .where(eq(registerInstallations.id, deviceId));
  return installation;
}

describe("DrizzleEveryInstallationRevocationStore", () => {
  it("revokes the installation in service of every branch as a suspected compromise", async () => {
    const { actorId, first, second } = await setUp();

    const outcome = await revokeEveryRegister(db, { actorId });

    expect(outcome).toEqual({
      kind: "revoked",
      revokedAt: REVOKED_AT,
      registers: expect.arrayContaining([
        {
          registerId: first.registerId,
          deviceId: first.deviceId,
          snapshotKeyVersion: 2,
          contingencyTicketKeyVersion: 2,
        },
        {
          registerId: second.registerId,
          deviceId: second.deviceId,
          snapshotKeyVersion: 2,
          contingencyTicketKeyVersion: 2,
        },
      ]),
    });
    for (const { deviceId } of [first, second]) {
      expect(await installationOf(deviceId)).toEqual({
        revokedAt: REVOKED_AT,
        revocationReason: "suspected_compromise",
      });
    }
  });

  it("leaves a register without an installation in service as it was", async () => {
    const { actorId } = await setUp();
    const idle = await seedRegisterWithKeys(db, { registerName: "Caja 3", revoked: true });
    const before = await installationOf(idle.deviceId);

    await revokeEveryRegister(db, { actorId });

    expect(await installationOf(idle.deviceId)).toEqual(before);
    expect(
      await db
        .select()
        .from(registerSnapshotKeys)
        .where(eq(registerSnapshotKeys.registerId, idle.registerId)),
    ).toHaveLength(1);
    expect(await db.select().from(alerts).where(eq(alerts.scope, idle.registerId))).toEqual([]);
  });

  it("answers that there is nothing to revoke, changing nothing, when no installation is in service", async () => {
    const actorId = await seedActor(db);
    const idle = await seedRegisterWithKeys(db, { registerName: "Caja 1", revoked: true });

    expect(await revokeEveryRegister(db, { actorId })).toEqual({ kind: "nothing_to_revoke" });

    expect(
      await db
        .select()
        .from(registerSnapshotKeys)
        .where(eq(registerSnapshotKeys.registerId, idle.registerId)),
    ).toHaveLength(1);
    expect(await db.select().from(alerts)).toEqual([]);
  });

  it("adds a new version of both keys of every revoked register and never deletes the retired ones", async () => {
    const { actorId, first, second } = await setUp();

    await revokeEveryRegister(db, { actorId });

    for (const { registerId } of [first, second]) {
      const snapshotVersions = await db
        .select({ version: registerSnapshotKeys.version })
        .from(registerSnapshotKeys)
        .where(eq(registerSnapshotKeys.registerId, registerId));
      const ticketVersions = await db
        .select({ version: registerContingencyTicketKeys.version })
        .from(registerContingencyTicketKeys)
        .where(eq(registerContingencyTicketKeys.registerId, registerId));
      expect(snapshotVersions.map(({ version }) => version).sort()).toEqual([1, 2]);
      expect(ticketVersions.map(({ version }) => version).sort()).toEqual([1, 2]);
    }
  });

  it("opens one alert per revoked register telling the installation was revoked", async () => {
    const { actorId, first, second } = await setUp();

    await revokeEveryRegister(db, { actorId });

    const opened = await db.select().from(alerts);
    expect(opened).toHaveLength(2);
    for (const { registerId, deviceId } of [first, second]) {
      expect(opened).toContainEqual(
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
      );
    }
  });

  it("audits, for each revoked register, the revocation and both key rotations with the actor", async () => {
    const { actorId, first, second } = await setUp();

    await revokeEveryRegister(db, { actorId });

    for (const { registerId, deviceId } of [first, second]) {
      const rowOf = async (entity: string, entityId: string) => {
        const [row] = await db
          .select({
            actorId: auditLog.actorId,
            at: auditLog.at,
            previousValue: auditLog.previousValue,
            newValue: auditLog.newValue,
          })
          .from(auditLog)
          .where(and(eq(auditLog.entity, entity), eq(auditLog.entityId, entityId)));
        return row;
      };
      expect(await rowOf("register_installation", deviceId)).toEqual({
        actorId,
        at: REVOKED_AT,
        previousValue: { revoked_at: null, revocation_reason: null },
        newValue: {
          register_id: registerId,
          revoked_at: REVOKED_AT.toISOString(),
          revocation_reason: "suspected_compromise",
        },
      });
      expect(await rowOf("register_snapshot_key", registerId)).toEqual({
        actorId,
        at: REVOKED_AT,
        previousValue: { version: 1 },
        newValue: { version: 2 },
      });
      expect(await rowOf("register_contingency_ticket_key", registerId)).toEqual({
        actorId,
        at: REVOKED_AT,
        previousValue: { version: 1 },
        newValue: { version: 2 },
      });
    }
  });

  it("leaves every user's PIN alone", async () => {
    const { actorId } = await setUp();

    await revokeEveryRegister(db, { actorId });

    expect(await db.select().from(userPins).where(eq(userPins.userId, actorId))).toHaveLength(1);
  });
});
