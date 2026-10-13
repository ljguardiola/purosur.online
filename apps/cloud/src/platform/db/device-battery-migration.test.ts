import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

describe("the device battery migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps what an installation reported and leaves its battery unreported", async () => {
    const database = await databaseBeforeMigration("_device_battery");

    const { rows: locationRows } = await database.query<{ id: string }>(
      "select id from locations limit 1",
    );
    const { rows: registerRows } = await database.query<{ id: string }>(
      "insert into registers (location_id, name) values ($1, 'Caja 1') returning id",
      [locationRows[0]?.id],
    );
    const { rows: installationRows } = await database.query<{ id: string }>(
      `insert into register_installations
         (register_id, token_lookup_prefix, token_hash, token_issued_at, hostname, windows_version,
          enrolled_at)
       values ($1, 'prefix', 'hash', now(), 'CAJA', 'Windows 11', now()) returning id`,
      [registerRows[0]?.id],
    );
    await database.query(
      "insert into device_state (device_id, app_version, disk_free_bytes) values ($1, '1.4.0', 5000)",
      [installationRows[0]?.id],
    );

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query<Record<string, unknown>>(
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
