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

async function syncChangesEntry(): Promise<JournalEntry> {
  return findMigrationEntry(
    "_sync_changes",
    "test setup: no sync changes migration in the journal",
  );
}

describe("the sync changes migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("logs every branch's current settings as a change, so a register pulling from the start receives them", async () => {
    const folder = await mkdtemp(join(tmpdir(), "sync-changes-migration-"));
    onTestFinished(() => rm(folder, { recursive: true, force: true }));
    await migrationsFolderBefore(folder, await syncChangesEntry());

    const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
    onTestFinished(() => client.close());

    const { rows: locationRows } = await client.query<{ id: string }>(
      "select id from locations limit 1",
    );
    const locationId = locationRows[0]?.id;
    await client.query(
      "update branch_settings set address = 'Av. Belgrano 1450', version = 4 where location_id = $1",
      [locationId],
    );
    const { rows: registerRows } = await client.query<{ id: string }>(
      "insert into registers (location_id, name) values ($1, 'Caja 1') returning id",
      [locationId],
    );
    const { rows: installationRows } = await client.query<{ id: string }>(
      `insert into register_installations
         (register_id, token_lookup_prefix, token_hash, hostname, windows_version, enrolled_at)
       values ($1, 'prefix', 'hash', 'CAJA', 'Windows 11', now()) returning id`,
      [registerRows[0]?.id],
    );

    await addMigrationEntry(folder, await syncChangesEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });

    const { rows: changes } = await client.query(
      "select change_seq, entity, entity_id, version, op, origin_device_id from changes",
    );
    expect(changes).toEqual([
      {
        change_seq: 1,
        entity: "branch_settings",
        entity_id: locationId,
        version: 4,
        op: "insert",
        origin_device_id: null,
      },
    ]);

    await expect(
      client.query(
        `insert into device_state (device_id, last_pull_since, last_pulled_at)
         values ($1, 1, now()) returning device_id`,
        [installationRows[0]?.id],
      ),
    ).resolves.toMatchObject({ rows: [{ device_id: installationRows[0]?.id }] });
  });
});
