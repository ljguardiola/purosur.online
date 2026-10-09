import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, inject, it, onTestFinished } from "vitest";
import { migrateFreshDatabase } from "../../test-support/test-database-snapshot.js";
import {
  addMigrationEntry,
  findMigrationEntry,
  type JournalEntry,
  migrationsFolderBefore,
} from "./test-support/migration-journal-test-helpers.js";

async function reportsEveryCycleEntry(): Promise<JournalEntry> {
  return findMigrationEntry(
    "_reports_every_cycle",
    "test setup: no reports-every-cycle migration in the journal",
  );
}

async function databaseBefore() {
  const folder = await mkdtemp(join(tmpdir(), "reports-every-cycle-migration-"));
  onTestFinished(() => rm(folder, { recursive: true, force: true }));
  await migrationsFolderBefore(folder, await reportsEveryCycleEntry());
  const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
  onTestFinished(() => client.close());
  const { rows: locationRows } = await client.query<{ id: string }>(
    "select id from locations limit 1",
  );
  const installation = async (name: string) => {
    const { rows: registerRows } = await client.query<{ id: string }>(
      "insert into registers (location_id, name) values ($1, $2) returning id",
      [locationRows[0]?.id, name],
    );
    const { rows } = await client.query<{ id: string }>(
      `insert into register_installations
         (register_id, token_lookup_prefix, token_hash, token_issued_at, hostname, windows_version, enrolled_at)
       values ($1, $2, 'hash', now(), $2, 'Windows 11', now()) returning id`,
      [registerRows[0]?.id, name],
    );
    const id = rows[0]?.id;
    if (!id) throw new Error("test setup: inserting the installation returned no row");
    return id;
  };
  const applyMigration = async () => {
    await addMigrationEntry(folder, await reportsEveryCycleEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });
  };
  return { client, installation, applyMigration };
}

describe("the reports-every-cycle migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps each installation's device state and knows none of them to report on every sync cycle", async () => {
    const { client, installation, applyMigration } = await databaseBefore();
    const deviceId = await installation("Caja 1");
    await client.query(
      `insert into device_state (device_id, last_pushed_at, last_accepted_push_at)
       values ($1, '2026-10-06T12:00:00Z', '2026-10-06T11:20:00Z')`,
      [deviceId],
    );

    await applyMigration();

    const { rows } = await client.query(
      "select device_id, last_pushed_at, last_accepted_push_at, reports_every_cycle_since from device_state",
    );
    expect(rows).toEqual([
      {
        device_id: deviceId,
        last_pushed_at: new Date("2026-10-06T12:00:00Z"),
        last_accepted_push_at: new Date("2026-10-06T11:20:00Z"),
        reports_every_cycle_since: null,
      },
    ]);
  });
});
