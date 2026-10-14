import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

async function migratedWithRegisterKey() {
  const database = await databaseBeforeMigration("_register_snapshot_generations");
  const { rows: locationRows } = await database.query<{ id: string }>(
    "select id from locations limit 1",
  );
  const { rows: registerRows } = await database.query<{ id: string }>(
    "insert into registers (location_id, name) values ($1, 'Caja 1') returning id",
    [locationRows[0]?.id],
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
  const migrated = await database.applyMigration();
  return { migrated, registerId, deviceId: installationRows[0]?.id };
}

const GENERATION_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

function insertGeneration(
  migrated: Awaited<ReturnType<typeof migratedWithRegisterKey>>,
  overrides: { keyVersion?: number; sha256?: string; status?: string; size?: number } = {},
) {
  return migrated.migrated.query(
    `insert into register_snapshot_generations
       (id, register_id, device_id, created_at, size, sha256, key_version, status)
     values ($1, $2, $3, now(), $4, $5, $6, $7)`,
    [
      GENERATION_ID,
      migrated.registerId,
      migrated.deviceId,
      overrides.size ?? 4096,
      overrides.sha256 ?? "ab".repeat(32),
      overrides.keyVersion ?? 1,
      overrides.status ?? "declared",
    ],
  );
}

describe("the register snapshot generations migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps a register's snapshot key and starts with no generation, freeze or lifecycle rules", async () => {
    const { migrated } = await migratedWithRegisterKey();

    const { rows: keys } = await migrated.query("select version from register_snapshot_keys");
    const { rows: generations } = await migrated.query(
      "select id from register_snapshot_generations",
    );
    const { rows: freezes } = await migrated.query(
      "select register_id from register_snapshot_retention_freezes",
    );
    const { rows: rules } = await migrated.query(
      "select hourly from register_snapshot_lifecycle_rules",
    );

    expect(keys).toEqual([{ version: 1 }]);
    expect([generations, freezes, rules]).toEqual([[], [], []]);
  });

  it("accepts a generation declared with a key version its register holds", async () => {
    const context = await migratedWithRegisterKey();

    await expect(insertGeneration(context)).resolves.toBeDefined();

    const { rows } = await context.migrated.query(
      "select status, pruned, object_deleted, failure_reason from register_snapshot_generations",
    );
    expect(rows).toEqual([
      { status: "declared", pruned: false, object_deleted: false, failure_reason: null },
    ]);
  });

  it.each([
    ["a key version its register does not hold", { keyVersion: 2 }],
    ["an unknown status", { status: "lost" }],
    ["a hash in uppercase", { sha256: "AB".repeat(32) }],
    ["a size of zero", { size: 0 }],
  ])("refuses a generation with %s", async (_name, overrides) => {
    const context = await migratedWithRegisterKey();

    await expect(insertGeneration(context, overrides)).rejects.toThrow();
  });

  it("refuses a failure reason on a generation that did not fail", async () => {
    const context = await migratedWithRegisterKey();

    await expect(
      context.migrated.query(
        `insert into register_snapshot_generations
           (id, register_id, device_id, created_at, size, sha256, key_version, status, failure_reason)
         values ($1, $2, $3, now(), 1, $4, 1, 'verified', 'hash_mismatch')`,
        [GENERATION_ID, context.registerId, context.deviceId, "ab".repeat(32)],
      ),
    ).rejects.toThrow();
  });

  it("keeps one retention freeze per register", async () => {
    const { migrated, registerId } = await migratedWithRegisterKey();
    await migrated.query(
      "insert into register_snapshot_retention_freezes (register_id, stage, frozen_at) values ($1, 'copy', now())",
      [registerId],
    );

    await expect(
      migrated.query(
        "insert into register_snapshot_retention_freezes (register_id, stage, frozen_at) values ($1, 'copy', now())",
        [registerId],
      ),
    ).rejects.toThrow();
    await expect(
      migrated.query(
        "insert into register_snapshot_retention_freezes (register_id, stage, frozen_at) values ($1, 'upload', now())",
        [registerId],
      ),
    ).rejects.toThrow();
  });

  it("keeps a single row of lifecycle rules, within the allowed ranges", async () => {
    const { migrated } = await migratedWithRegisterKey();
    await migrated.query(
      "insert into register_snapshot_lifecycle_rules (hourly, daily, monthly) values (24, 30, 12)",
    );

    await expect(
      migrated.query(
        "insert into register_snapshot_lifecycle_rules (hourly, daily, monthly) values (24, 30, 12)",
      ),
    ).rejects.toThrow();
    await expect(
      migrated.query("update register_snapshot_lifecycle_rules set hourly = 73"),
    ).rejects.toThrow();
    await expect(
      migrated.query("update register_snapshot_lifecycle_rules set daily = 0"),
    ).rejects.toThrow();
    await expect(
      migrated.query("update register_snapshot_lifecycle_rules set monthly = 25"),
    ).rejects.toThrow();
  });
});
