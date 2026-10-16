import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  alerts,
  auditLog,
  registerContingencyTicketKeys,
  registerInstallations,
  registerSnapshotKeys,
  userPins,
  users,
} from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import {
  runQueuedBehindHeldLock,
  waitForLockWaiters,
} from "../test-support/queued-behind-held-lock.js";
import { insertEnrolledInstallation } from "./test-support/enrolled-installation.js";
import {
  insertFirstKeys,
  insertUserWithPin,
  REVOKED_AT,
  revokeRegister,
} from "./test-support/lost-register-revocation-fixtures.js";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let admin: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("lost_register_revocation");
  sql = postgres(integrationDb.databaseUrl, { max: 6 });
  admin = postgres(integrationDb.adminDatabaseUrl, { max: 1 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await admin.end({ timeout: 1 });
  await integrationDb.close();
});

async function seedRegister(registerName: string) {
  const installation = await insertEnrolledInstallation(db, {
    now: REVOKED_AT,
    registerName,
  });
  const actorId = await insertUserWithPin(db, {
    firstName: registerName.replace(/\W/g, ""),
    locationId: installation.locationId,
  });
  await insertFirstKeys(db, installation.registerId);
  return { ...installation, actorId };
}

describe("revoking a lost register on a real Postgres", () => {
  it("lets only one of two concurrent revocations revoke it, the other finding no active installation", async () => {
    const { registerId, locationId, actorId } = await seedRegister("Caja concurrente");

    const outcomes = await runQueuedBehindHeldLock(
      sql,
      (holder) => holder`select id from registers where id = ${registerId} for no key update`,
      () => revokeRegister(db, { branchId: locationId, registerId, actorId }),
      () => revokeRegister(db, { branchId: locationId, registerId, actorId }),
    );

    expect(outcomes.map(({ kind }) => kind)).toEqual(["revoked", "no_active_installation"]);
    expect(
      (
        await db
          .select()
          .from(registerSnapshotKeys)
          .where(eq(registerSnapshotKeys.registerId, registerId))
      ).length,
    ).toBe(2);
    expect(
      (
        await db
          .select()
          .from(registerContingencyTicketKeys)
          .where(eq(registerContingencyTicketKeys.registerId, registerId))
      ).length,
    ).toBe(2);
    expect(await db.select().from(alerts).where(eq(alerts.scope, registerId))).toHaveLength(1);
  });

  it("waits for a PIN operation holding a branch user, which removes that PIN first, instead of deadlocking with it", async () => {
    const { registerId, locationId, actorId } = await seedRegister("Caja con PIN en curso");
    const userVersion = async () => {
      const [user] = await db
        .select({ version: users.version })
        .from(users)
        .where(eq(users.id, actorId));
      return user?.version;
    };
    const versionBefore = await userVersion();
    const pinOperation = await sql.reserve();
    let revocation: ReturnType<typeof revokeRegister> | undefined;
    let settled: Promise<unknown> = Promise.resolve();
    try {
      await pinOperation`begin`;
      await pinOperation`select id from users where id = ${actorId} for no key update`;
      revocation = revokeRegister(db, { branchId: locationId, registerId, actorId });
      settled = Promise.allSettled([revocation]);
      await waitForLockWaiters(sql, 1);
      await pinOperation`delete from user_pins where user_id = ${actorId}`;
      await pinOperation`update users set version = version + 1 where id = ${actorId}`;
      await pinOperation`commit`;
    } finally {
      await pinOperation`rollback`;
      pinOperation.release();
      await settled;
    }

    expect((await revocation)?.kind).toBe("revoked");
    expect(await db.select().from(userPins).where(eq(userPins.userId, actorId))).toEqual([]);
    expect(await userVersion()).toBe((versionBefore ?? 0) + 1);
  });

  it("commits nothing when a step fails: the installation, the keys, the PINs and the alert stay as they were", async () => {
    const { registerId, locationId, deviceId, actorId } = await seedRegister("Caja fallida");
    await admin.unsafe(`
      create function refuse_lost_register_audit() returns trigger language plpgsql as $$
      begin
        raise exception 'audit refused by the test';
      end $$;
      create trigger refuse_lost_register_audit before insert on audit_log
        for each row when (new.entity = 'register_contingency_ticket_key')
        execute function refuse_lost_register_audit();
    `);

    await expect(
      revokeRegister(db, { branchId: locationId, registerId, actorId }),
    ).rejects.toThrow();

    const [installation] = await db
      .select({
        revokedAt: registerInstallations.revokedAt,
        revocationReason: registerInstallations.revocationReason,
      })
      .from(registerInstallations)
      .where(eq(registerInstallations.id, deviceId));
    expect(installation).toEqual({ revokedAt: null, revocationReason: null });
    expect(
      await db
        .select()
        .from(registerSnapshotKeys)
        .where(eq(registerSnapshotKeys.registerId, registerId)),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(registerContingencyTicketKeys)
        .where(eq(registerContingencyTicketKeys.registerId, registerId)),
    ).toHaveLength(1);
    expect(await db.select().from(userPins).where(eq(userPins.userId, actorId))).toHaveLength(1);
    expect(await db.select().from(alerts).where(eq(alerts.scope, registerId))).toEqual([]);
    expect(await db.select().from(auditLog).where(eq(auditLog.entityId, deviceId))).toEqual([]);
  });
});
