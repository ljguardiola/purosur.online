import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

const GENERATION_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

async function migratedWithGeneration() {
  const database = await databaseBeforeMigration("_snapshot_generations_last_device_seq");
  const { rows: registerRows } = await database.query<{ id: string }>(
    `insert into registers (location_id, name) select id, 'Caja 1' from locations limit 1
     returning id`,
  );
  const registerId = registerRows[0]?.id;
  const { rows: installationRows } = await database.query<{ id: string }>(
    `insert into register_installations
       (register_id, token_lookup_prefix, token_hash, token_issued_at, hostname,
        windows_version, enrolled_at)
     values ($1, 'prefix', 'hash', now(), 'CAJA', 'Windows 11', now()) returning id`,
    [registerId],
  );
  await database.query(
    "insert into register_snapshot_keys (register_id, version, key) values ($1, 1, 'sealed')",
    [registerId],
  );
  await database.query(
    `insert into register_snapshot_generations
       (id, register_id, device_id, created_at, size, sha256, key_version, status)
     values ($1, $2, $3, now(), 4096, $4, 1, 'verified')`,
    [GENERATION_ID, registerId, installationRows[0]?.id, "ab".repeat(32)],
  );
  return database.applyMigration();
}

describe("the snapshot generations last device sequence migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps every generation already declared, holding no change of its register", async () => {
    const migrated = await migratedWithGeneration();

    const { rows } = await migrated.query(
      "select id, status, last_device_seq from register_snapshot_generations",
    );

    expect(rows).toEqual([{ id: GENERATION_ID, status: "verified", last_device_seq: 0 }]);
  });
});
