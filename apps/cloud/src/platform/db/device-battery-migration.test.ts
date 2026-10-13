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

async function deviceBatteryEntry(): Promise<JournalEntry> {
  return findMigrationEntry(
    "_device_battery",
    "test setup: no device battery migration in the journal",
  );
}

describe("the device battery migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps what an installation reported and leaves its battery unreported", async () => {
    const folder = await mkdtemp(join(tmpdir(), "device-battery-migration-"));
    onTestFinished(() => rm(folder, { recursive: true, force: true }));
    await migrationsFolderBefore(folder, await deviceBatteryEntry());

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
         (register_id, token_lookup_prefix, token_hash, token_issued_at, hostname, windows_version,
          enrolled_at)
       values ($1, 'prefix', 'hash', now(), 'CAJA', 'Windows 11', now()) returning id`,
      [registerRows[0]?.id],
    );
    await client.query(
      "insert into device_state (device_id, app_version, disk_free_bytes) values ($1, '1.4.0', 5000)",
      [installationRows[0]?.id],
    );

    await addMigrationEntry(folder, await deviceBatteryEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });

    const { rows } = await client.query<Record<string, unknown>>(
      `select app_version, disk_free_bytes, battery_present, battery_charge_percent,
              battery_health_percent, battery_on_battery, battery_on_battery_minutes,
              battery_reported_at
       from device_state`,
    );
    expect(rows).toEqual([
      {
        app_version: "1.4.0",
        disk_free_bytes: 5000,
        battery_present: null,
        battery_charge_percent: null,
        battery_health_percent: null,
        battery_on_battery: null,
        battery_on_battery_minutes: null,
        battery_reported_at: null,
      },
    ]);
  });
});
