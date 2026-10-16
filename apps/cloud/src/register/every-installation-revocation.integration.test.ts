import { enrollInstallation, rotateRegisterSnapshotKey } from "@purosur/domain/register/use-cases";
import { asc, eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  alerts,
  auditLog,
  registerContingencyTicketKeys,
  registerEnrollmentCodes,
  registerInstallations,
  registerSnapshotKeys,
} from "../platform/db/schema.js";
import { hashSecretCode } from "../platform/secret-code.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import {
  runQueuedBehindHeldLock,
  waitForLockWaiters,
} from "../test-support/queued-behind-held-lock.js";
import { issueDeviceToken } from "./device-token.js";
import { DrizzleSnapshotKeyRotationStore } from "./drizzle-snapshot-key-rotation-store.js";
import { generateInstallationKey } from "./installation-key.js";
import { installationKeyCipher } from "./installation-key-cipher.js";
import { registerEnrollmentCodeMatches } from "./register-enrollment-code.js";
import {
  revokeEveryRegister,
  seedActor,
  seedRegisterWithKeys,
} from "./test-support/every-installation-revocation-fixtures.js";
import { keyStore } from "./test-support/key-store.js";
import { REVOKED_AT, revokeRegister } from "./test-support/lost-register-revocation-fixtures.js";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let admin: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("every_installation_revocation");
  sql = postgres(integrationDb.databaseUrl, { max: 8 });
  admin = postgres(integrationDb.adminDatabaseUrl, { max: 1 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await admin.end({ timeout: 1 });
  await integrationDb.close();
});

const ENROLLMENT_CODE = "P4NX7KWE2QRT6MZD";

async function issueEnrollmentCode(registerId: string) {
  await db.insert(registerEnrollmentCodes).values({
    registerId,
    codeLookup: ENROLLMENT_CODE.slice(0, 4),
    codeHash: hashSecretCode(ENROLLMENT_CODE),
    issuedAt: REVOKED_AT,
    expiresAt: new Date(REVOKED_AT.getTime() + 15 * 60 * 1000),
  });
}

function enrollNewInstallation() {
  return enrollInstallation(
    {
      store: keyStore(db),
      clock: { now: () => REVOKED_AT },
      tokens: { issue: issueDeviceToken },
      codes: { matches: registerEnrollmentCodeMatches },
      keys: { generate: generateInstallationKey },
    },
    {
      code: ENROLLMENT_CODE,
      sourceAddress: "203.0.113.7",
      hostname: "CAJA-NUEVA",
      windowsVersion: "Windows 11 Pro 10.0.26100",
    },
  );
}

async function installationsOf(registerId: string) {
  return db
    .select({
      hostname: registerInstallations.hostname,
      revokedAt: registerInstallations.revokedAt,
      revocationReason: registerInstallations.revocationReason,
    })
    .from(registerInstallations)
    .where(eq(registerInstallations.registerId, registerId))
    .orderBy(asc(registerInstallations.enrolledAt));
}

async function keyVersionsOf(registerId: string) {
  const versions = async (
    table: typeof registerSnapshotKeys | typeof registerContingencyTicketKeys,
  ) =>
    (
      await db
        .select({ version: table.version })
        .from(table)
        .where(eq(table.registerId, registerId))
    )
      .map(({ version }) => version)
      .sort();
  return {
    snapshot: await versions(registerSnapshotKeys),
    contingencyTicket: await versions(registerContingencyTicketKeys),
  };
}

describe("revoking every installation on a real Postgres", () => {
  it("revokes the installation an enrollment is replacing it with when the enrollment commits first", async () => {
    const actorId = await seedActor(db);
    const { registerId } = await seedRegisterWithKeys(db, { registerName: "Caja en reemplazo" });
    await issueEnrollmentCode(registerId);

    const [enrollment, revocation] = await runQueuedBehindHeldLock(
      sql,
      (holder) =>
        holder`select register_id from register_enrollment_codes where register_id = ${registerId} for update`,
      enrollNewInstallation,
      () => revokeEveryRegister(db, { actorId }),
    );

    expect(enrollment.kind).toBe("enrolled");
    expect(revocation).toMatchObject({ kind: "revoked" });
    expect(await installationsOf(registerId)).toEqual([
      { hostname: "CAJA-MOSTRADOR", revokedAt: REVOKED_AT, revocationReason: "replaced" },
      { hostname: "CAJA-NUEVA", revokedAt: REVOKED_AT, revocationReason: "suspected_compromise" },
    ]);
    expect(await keyVersionsOf(registerId)).toEqual({
      snapshot: [1, 2],
      contingencyTicket: [1, 2],
    });
  });

  it("lets an enrollment that started after the revocation complete, leaving its new installation in service", async () => {
    const actorId = await seedActor(db);
    const { registerId } = await seedRegisterWithKeys(db, { registerName: "Caja que se enrola" });
    await issueEnrollmentCode(registerId);

    const [revocation, enrollment] = await runQueuedBehindHeldLock(
      sql,
      (holder) =>
        holder`select register_id from register_enrollment_codes where register_id = ${registerId} for update`,
      () => revokeEveryRegister(db, { actorId }),
      enrollNewInstallation,
    );

    expect(revocation).toMatchObject({ kind: "revoked" });
    expect(enrollment.kind).toBe("enrolled");
    expect(await installationsOf(registerId)).toEqual([
      {
        hostname: "CAJA-MOSTRADOR",
        revokedAt: REVOKED_AT,
        revocationReason: "suspected_compromise",
      },
      { hostname: "CAJA-NUEVA", revokedAt: null, revocationReason: null },
    ]);
  });

  it("revokes a register once when a single revocation of it races, and still revokes the others", async () => {
    const actorId = await seedActor(db);
    const raced = await seedRegisterWithKeys(db, { registerName: "Caja en carrera" });
    const other = await seedRegisterWithKeys(db, {
      registerName: "Caja de otra sucursal",
      inOtherBranch: true,
    });

    const [single, every] = await runQueuedBehindHeldLock(
      sql,
      (holder) => holder`select id from registers where id = ${raced.registerId} for no key update`,
      () =>
        revokeRegister(db, {
          branchId: raced.locationId,
          registerId: raced.registerId,
          actorId,
        }),
      () => revokeEveryRegister(db, { actorId }),
    );

    expect(single.kind).toBe("revoked");
    expect(every).toMatchObject({
      kind: "revoked",
      registers: [expect.objectContaining({ registerId: other.registerId })],
    });
    expect(await installationsOf(raced.registerId)).toEqual([
      expect.objectContaining({ revocationReason: "lost_or_stolen" }),
    ]);
    expect(await installationsOf(other.registerId)).toEqual([
      expect.objectContaining({ revocationReason: "suspected_compromise" }),
    ]);
    expect(await keyVersionsOf(raced.registerId)).toEqual({
      snapshot: [1, 2],
      contingencyTicket: [1, 2],
    });
    expect(await db.select().from(alerts).where(eq(alerts.scope, raced.registerId))).toHaveLength(
      1,
    );
  });

  it("leaves a single revocation that started later finding no installation in service", async () => {
    const actorId = await seedActor(db);
    const raced = await seedRegisterWithKeys(db, { registerName: "Caja revocada primero" });

    const [every, single] = await runQueuedBehindHeldLock(
      sql,
      (holder) => holder`select id from registers where id = ${raced.registerId} for no key update`,
      () => revokeEveryRegister(db, { actorId }),
      () =>
        revokeRegister(db, {
          branchId: raced.locationId,
          registerId: raced.registerId,
          actorId,
        }),
    );

    expect(every.kind).toBe("revoked");
    expect(single.kind).toBe("no_active_installation");
    expect(await keyVersionsOf(raced.registerId)).toEqual({
      snapshot: [1, 2],
      contingencyTicket: [1, 2],
    });
  });

  describe("racing a snapshot key rotation of a register", () => {
    function rotateSnapshotKey(registerId: string, actorId: string) {
      return rotateRegisterSnapshotKey(
        {
          store: new DrizzleSnapshotKeyRotationStore(
            db,
            installationKeyCipher(TEST_INSTALLATION_KEYS_ENCRYPTION_KEY),
            () => REVOKED_AT,
          ),
          keys: { generate: generateInstallationKey },
        },
        { registerId, actorId },
      );
    }

    function holdRegisterKeys(registerId: string) {
      return (holder: postgres.ReservedSql) =>
        holder`select pg_advisory_xact_lock(hashtextextended(${`register_keys:${registerId}`}, 0))`;
    }

    it("gives consecutive versions when the rotation takes the keys first", async () => {
      const actorId = await seedActor(db);
      const { registerId } = await seedRegisterWithKeys(db, { registerName: "Caja rotando" });

      const [rotation, revocation] = await runQueuedBehindHeldLock(
        sql,
        holdRegisterKeys(registerId),
        () => rotateSnapshotKey(registerId, actorId),
        () => revokeEveryRegister(db, { actorId }),
      );

      expect(rotation).toEqual({ kind: "rotated", keyVersion: 2 });
      expect(revocation).toMatchObject({ kind: "revoked" });
      expect(await keyVersionsOf(registerId)).toEqual({
        snapshot: [1, 2, 3],
        contingencyTicket: [1, 2],
      });
    });

    it("gives consecutive versions when the revocation takes the keys first", async () => {
      const actorId = await seedActor(db);
      const { registerId } = await seedRegisterWithKeys(db, { registerName: "Caja revocándose" });

      const [revocation, rotation] = await runQueuedBehindHeldLock(
        sql,
        holdRegisterKeys(registerId),
        () => revokeEveryRegister(db, { actorId }),
        () => rotateSnapshotKey(registerId, actorId),
      );

      expect(revocation).toMatchObject({ kind: "revoked" });
      expect(rotation).toEqual({ kind: "rotated", keyVersion: 3 });
      expect(await keyVersionsOf(registerId)).toEqual({
        snapshot: [1, 2, 3],
        contingencyTicket: [1, 2],
      });
    });
  });

  it("waits for a holder of a register to finish instead of skipping it", async () => {
    const actorId = await seedActor(db);
    const { registerId } = await seedRegisterWithKeys(db, { registerName: "Caja retenida" });
    const holder = await sql.reserve();
    let revocation: ReturnType<typeof revokeEveryRegister> | undefined;
    let settled: Promise<unknown> = Promise.resolve();
    try {
      await holder`begin`;
      await holder`select id from registers where id = ${registerId} for no key update`;
      revocation = revokeEveryRegister(db, { actorId });
      settled = Promise.allSettled([revocation]);
      await waitForLockWaiters(sql, 1);
    } finally {
      await holder`rollback`;
      holder.release();
      await settled;
    }

    expect((await revocation)?.kind).toBe("revoked");
    expect(await installationsOf(registerId)).toEqual([
      expect.objectContaining({ revocationReason: "suspected_compromise" }),
    ]);
  });

  it("commits nothing for any register when a step fails for the last one", async () => {
    const actorId = await seedActor(db);
    const first = await seedRegisterWithKeys(db, { registerName: "Caja fallida 1" });
    const second = await seedRegisterWithKeys(db, {
      registerName: "Caja fallida 2",
      inOtherBranch: true,
    });
    const [, last] = [first, second].sort((a, b) => a.registerId.localeCompare(b.registerId));
    if (!last) {
      throw new Error("test setup: no register to fail on");
    }
    await admin.unsafe(`
      create function refuse_every_installation_audit() returns trigger language plpgsql as $$
      begin
        raise exception 'audit refused by the test';
      end $$;
      create trigger refuse_every_installation_audit before insert on audit_log
        for each row when (new.entity = 'register_contingency_ticket_key' and new.entity_id = '${last.registerId}')
        execute function refuse_every_installation_audit();
    `);

    await expect(revokeEveryRegister(db, { actorId })).rejects.toThrow();

    for (const { registerId } of [first, second]) {
      expect(await installationsOf(registerId)).toEqual([
        { hostname: "CAJA-MOSTRADOR", revokedAt: null, revocationReason: null },
      ]);
      expect(await keyVersionsOf(registerId)).toEqual({
        snapshot: [1],
        contingencyTicket: [1],
      });
      expect(await db.select().from(alerts).where(eq(alerts.scope, registerId))).toEqual([]);
      expect(await db.select().from(auditLog).where(eq(auditLog.entityId, registerId))).toEqual([]);
    }
  });
});
