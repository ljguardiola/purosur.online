import { randomUUID } from "node:crypto";
import {
  applySnapshotRetention,
  reportSnapshotCorruption,
  requestSnapshotUpload,
  type SnapshotObjects,
} from "@purosur/domain/register/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  registerInstallations,
  registerSnapshotGenerations,
  registerSnapshotRetentionFreezes,
  registers,
} from "../platform/db/schema.js";
import { postgresDedicatedConnections } from "../platform/dedicated-connections.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import {
  runQueuedBehindHeldLock,
  waitForLockWaiters,
} from "../test-support/queued-behind-held-lock.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleRegisterStore } from "./drizzle-register-store.js";
import { DrizzleRegisterSnapshotLanes, DrizzleSnapshotStore } from "./drizzle-snapshot-store.js";
import { installationKeyCipher } from "./installation-key-cipher.js";

const NOW = new Date("2026-10-14T15:00:00.000Z");
const GENERATION_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("register_snapshots_race");
  sql = postgres(integrationDb.databaseUrl, { max: 6 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

async function registerWithInstallationAndKey(name = "Caja 1") {
  const [register] = await db
    .insert(registers)
    .values({ locationId: await seededLocationId(db), name })
    .returning({ id: registers.id });
  if (!register) throw new Error("test setup: seeding the register returned no row");
  const [installation] = await db
    .insert(registerInstallations)
    .values({
      registerId: register.id,
      tokenLookupPrefix: `prefix-${register.id}`,
      tokenHash: "hash",
      tokenIssuedAt: NOW,
      hostname: "CAJA-MOSTRADOR",
      windowsVersion: "Windows 11 Pro 10.0.26100",
      enrolledAt: NOW,
    })
    .returning({ id: registerInstallations.id });
  if (!installation) throw new Error("test setup: seeding the installation returned no row");
  await new DrizzleRegisterStore(
    db,
    installationKeyCipher(TEST_INSTALLATION_KEYS_ENCRYPTION_KEY),
  ).transaction((tx) => tx.recordSnapshotKey(register.id, { version: 1, key: "key-1" }));
  return { registerId: register.id, deviceId: installation.id };
}

describe("declaring one snapshot generation twice at once on a real Postgres through postgres-js", () => {
  it("lets the second wait for the first and find the generation it declared", async () => {
    const { registerId, deviceId } = await registerWithInstallationAndKey();
    const store = new DrizzleSnapshotStore(db);
    const declare = () =>
      requestSnapshotUpload(
        { store, clock: { now: () => NOW } },
        {
          registerId,
          deviceId,
          generationId: GENERATION_ID,
          size: 4096,
          sha256: "ab".repeat(32),
          keyVersion: 1,
        },
      );

    const outcomes = await runQueuedBehindHeldLock(
      sql,
      (holder) =>
        holder`select pg_advisory_xact_lock(hashtextextended(${`register_snapshots:${registerId}`}, 0))`,
      declare,
      declare,
    );

    expect(outcomes.map((outcome) => outcome.kind)).toEqual(["authorized", "authorized"]);
    expect(await db.select().from(registerSnapshotGenerations)).toHaveLength(1);
  });
});

class HeldRemovals implements SnapshotObjects {
  private announceRemoval: () => void = () => {};
  readonly removalStarted = new Promise<void>((resolve) => {
    this.announceRemoval = resolve;
  });
  private finishRemoval: () => void = () => {};
  private readonly removalFinished = new Promise<void>((resolve) => {
    this.finishRemoval = resolve;
  });

  async inspect() {
    return undefined;
  }

  async remove() {
    this.announceRemoval();
    await this.removalFinished;
  }

  release(): void {
    this.finishRemoval();
  }
}

describe("a corruption report while retention deletes objects on a real Postgres", () => {
  it("waits until retention has recorded every deletion of that register", async () => {
    const { registerId, deviceId } = await registerWithInstallationAndKey("Caja 2");
    const failedId = randomUUID();
    const generation = {
      registerId,
      deviceId,
      createdAt: NOW,
      size: 4096,
      sha256: "ab".repeat(32),
    };
    await db.insert(registerSnapshotGenerations).values([
      ...Array.from({ length: 6 }, () => ({
        ...generation,
        id: randomUUID(),
        keyVersion: 1,
        status: "verified" as const,
      })),
      {
        ...generation,
        id: failedId,
        keyVersion: 1,
        status: "failed" as const,
        failureReason: "hash_mismatch" as const,
      },
    ]);
    const store = new DrizzleSnapshotStore(db);
    const objects = new HeldRemovals();
    const clock = { now: () => NOW };

    const retention = applySnapshotRetention({
      store,
      lanes: new DrizzleRegisterSnapshotLanes(postgresDedicatedConnections(sql)),
      clock,
      objects,
    });
    await objects.removalStarted;
    const report = reportSnapshotCorruption({ store, clock }, { registerId, stage: "copy" });
    let frozenWhileDeleting: unknown[];
    try {
      await waitForLockWaiters(sql, 1);
      frozenWhileDeleting = await db
        .select()
        .from(registerSnapshotRetentionFreezes)
        .where(eq(registerSnapshotRetentionFreezes.registerId, registerId));
    } finally {
      objects.release();
    }
    await retention;
    await report;

    expect(frozenWhileDeleting).toEqual([]);
    expect(
      await db
        .select()
        .from(registerSnapshotRetentionFreezes)
        .where(eq(registerSnapshotRetentionFreezes.registerId, registerId)),
    ).toHaveLength(1);
    expect(
      (await db.select().from(registerSnapshotGenerations)).find((row) => row.id === failedId),
    ).toMatchObject({ pruned: true, objectDeleted: true });
  });
});
