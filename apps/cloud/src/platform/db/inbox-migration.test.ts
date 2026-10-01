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

async function inboxEntry(): Promise<JournalEntry> {
  return findMigrationEntry(
    "_inbox_and_push_report",
    "test setup: no inbox migration in the journal",
  );
}

describe("the inbox migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps what an installation's device state holds, with no push report yet", async () => {
    const folder = await mkdtemp(join(tmpdir(), "inbox-migration-"));
    onTestFinished(() => rm(folder, { recursive: true, force: true }));
    await migrationsFolderBefore(folder, await inboxEntry());
    const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
    onTestFinished(() => client.close());
    const { rows: locationRows } = await client.query<{ id: string }>(
      "select id from locations limit 1",
    );
    const { rows: registerRows } = await client.query<{ id: string }>(
      "insert into registers (location_id, name) values ($1, 'Caja 1') returning id",
      [locationRows[0]?.id],
    );
    const { rows: installationRows } = await client.query<{ id: string }>(
      `insert into register_installations
         (register_id, token_lookup_prefix, token_hash, token_issued_at, hostname, windows_version, enrolled_at)
       values ($1, 'prefix', 'hash', now(), 'CAJA', 'Windows 11', now()) returning id`,
      [registerRows[0]?.id],
    );
    await client.query(
      "insert into device_state (device_id, last_pull_since, last_pulled_at) values ($1, 7, now())",
      [installationRows[0]?.id],
    );

    await addMigrationEntry(folder, await inboxEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });

    const { rows } = await client.query(
      `select last_pull_since, app_version, last_pushed_at, wal_size_bytes, disk_free_bytes,
              disk_free_ratio
       from device_state`,
    );
    expect(rows).toEqual([
      {
        last_pull_since: 7,
        app_version: null,
        last_pushed_at: null,
        wal_size_bytes: null,
        disk_free_bytes: null,
        disk_free_ratio: null,
      },
    ]);
    const { rows: inboxRows } = await client.query("select event_id from inbox");
    expect(inboxRows).toEqual([]);
  });
});
