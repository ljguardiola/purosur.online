import {
  changeSnapshotLifecycleRules,
  rotateRegisterSnapshotKey,
} from "@purosur/domain/register/use-cases";
import { asc, eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, registerSnapshotKeys, registers } from "../platform/db/schema.js";
import { openBackofficeSession, SESSION_NOON } from "../test-support/backoffice-session.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleSnapshotKeyRotationStore } from "./drizzle-snapshot-key-rotation-store.js";
import { DrizzleSnapshotLifecycleRulesStore } from "./drizzle-snapshot-lifecycle-rules-store.js";
import { generateInstallationKey } from "./installation-key.js";
import { installationKeyCipher } from "./installation-key-cipher.js";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("snapshot_backups_race");
  sql = postgres(integrationDb.databaseUrl, { max: 6 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function advancingClock(): () => Date {
  let calls = 0;
  return () => new Date(SESSION_NOON.getTime() + calls++ * 1000);
}

let seededActor: Promise<string> | undefined;

function actor(): Promise<string> {
  seededActor ??= seedActor();
  return seededActor;
}

async function seedActor(): Promise<string> {
  const session = await openBackofficeSession(db, {
    now: SESSION_NOON,
    locationId: await seededLocationId(db),
    permissionKeys: [],
  });
  return session.userId;
}

describe("changing the snapshot lifecycle rules twice at once on a real Postgres through postgres-js", () => {
  it("makes the second change start from the rules the first one stored, creating the single row once", async () => {
    const actorId = await actor();
    const ports = { store: new DrizzleSnapshotLifecycleRulesStore(db, advancingClock()) };
    const first = { hourly: 10, daily: 20, monthly: 5 };
    const second = { hourly: 11, daily: 21, monthly: 6 };

    const outcomes = await runQueuedBehindHeldLock(
      sql,
      (holder) =>
        holder`select pg_advisory_xact_lock(hashtextextended(${"snapshot_lifecycle_rules"}, 0))`,
      () => changeSnapshotLifecycleRules(ports, { rules: first, actorId }),
      () => changeSnapshotLifecycleRules(ports, { rules: second, actorId }),
    );

    expect(outcomes).toEqual([
      { kind: "changed", rules: first },
      { kind: "changed", rules: second },
    ]);
    expect(
      await db
        .select({ previous: auditLog.previousValue, next: auditLog.newValue })
        .from(auditLog)
        .where(eq(auditLog.entity, "register_snapshot_lifecycle_rules"))
        .orderBy(asc(auditLog.at)),
    ).toEqual([
      { previous: { hourly: 24, daily: 30, monthly: 12 }, next: first },
      { previous: first, next: second },
    ]);
  });
});

describe("rotating one register's snapshot key twice at once on a real Postgres through postgres-js", () => {
  it("gives each rotation its own version instead of colliding on the same one", async () => {
    const actorId = await actor();
    const [register] = await db
      .insert(registers)
      .values({ locationId: await seededLocationId(db), name: "Caja 1" })
      .returning({ id: registers.id });
    if (!register) throw new Error("test setup: seeding the register returned no row");
    const cipher = installationKeyCipher(TEST_INSTALLATION_KEYS_ENCRYPTION_KEY);
    const ports = {
      store: new DrizzleSnapshotKeyRotationStore(db, cipher, advancingClock()),
      keys: { generate: generateInstallationKey },
    };
    await db.insert(registerSnapshotKeys).values({
      registerId: register.id,
      version: 1,
      key: cipher.seal(generateInstallationKey(), `snapshot_key:${register.id}:1`),
    });

    const outcomes = await runQueuedBehindHeldLock(
      sql,
      (holder) =>
        holder`select pg_advisory_xact_lock(hashtextextended(${`register_keys:${register.id}`}, 0))`,
      () => rotateRegisterSnapshotKey(ports, { registerId: register.id, actorId }),
      () => rotateRegisterSnapshotKey(ports, { registerId: register.id, actorId }),
    );

    expect(outcomes).toEqual([
      { kind: "rotated", keyVersion: 2 },
      { kind: "rotated", keyVersion: 3 },
    ]);
  });
});
