import type { RegisterStoreTransaction } from "@purosur/domain/register/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerSnapshotKeys, registers } from "../platform/db/schema.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleRegisterStore } from "./drizzle-register-store.js";
import { installationKeyCipher } from "./installation-key-cipher.js";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("register_keys_race");
  sql = postgres(integrationDb.databaseUrl, { max: 6 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

async function firstSnapshotKey(tx: RegisterStoreTransaction, registerId: string, key: string) {
  const held = await tx.lockRegisterKeys(registerId);
  if (held.snapshotKeys.length === 0) {
    await tx.recordSnapshotKey(registerId, { version: 1, key });
    return key;
  }
  return held.snapshotKeys[0]?.key;
}

// PGlite runs every query over one connection, so it can never race two handovers of the same
// register's keys; this runs them over a real multi-connection postgres-js pool instead.
describe("handing one register its first keys twice at once on a real Postgres through postgres-js", () => {
  it("lets the second wait for the first and find the key the first recorded", async () => {
    const [register] = await db
      .insert(registers)
      .values({ locationId: await seededLocationId(db), name: "Caja 1" })
      .returning({ id: registers.id });
    if (!register) throw new Error("test setup: seeding the register returned no row");
    const store = new DrizzleRegisterStore(
      db,
      installationKeyCipher(TEST_INSTALLATION_KEYS_ENCRYPTION_KEY),
    );

    const outcomes = await runQueuedBehindHeldLock(
      sql,
      (holder) =>
        holder`select pg_advisory_xact_lock(hashtextextended(${`register_keys:${register.id}`}, 0))`,
      () => store.transaction((tx) => firstSnapshotKey(tx, register.id, "first")),
      () => store.transaction((tx) => firstSnapshotKey(tx, register.id, "second")),
    );

    expect(outcomes).toEqual(["first", "first"]);
    expect(
      await db
        .select({ version: registerSnapshotKeys.version, key: registerSnapshotKeys.key })
        .from(registerSnapshotKeys)
        .where(eq(registerSnapshotKeys.registerId, register.id)),
    ).toEqual([{ version: 1, key: expect.not.stringContaining("first") }]);
  });
});
