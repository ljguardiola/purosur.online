import { requestSnapshotUpload } from "@purosur/domain/register/use-cases";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  registerInstallations,
  registerSnapshotGenerations,
  registers,
} from "../platform/db/schema.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleRegisterStore } from "./drizzle-register-store.js";
import { DrizzleSnapshotStore } from "./drizzle-snapshot-store.js";
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

async function registerWithInstallationAndKey() {
  const [register] = await db
    .insert(registers)
    .values({ locationId: await seededLocationId(db), name: "Caja 1" })
    .returning({ id: registers.id });
  if (!register) throw new Error("test setup: seeding the register returned no row");
  const [installation] = await db
    .insert(registerInstallations)
    .values({
      registerId: register.id,
      tokenLookupPrefix: "prefix",
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
