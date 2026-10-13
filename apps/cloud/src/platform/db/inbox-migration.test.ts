import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

describe("the inbox migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps what an installation's device state holds, with no push report yet", async () => {
    const database = await databaseBeforeMigration("_inbox_and_push_report");
    const { rows: locationRows } = await database.query<{ id: string }>(
      "select id from locations limit 1",
    );
    const { rows: registerRows } = await database.query<{ id: string }>(
      "insert into registers (location_id, name) values ($1, 'Caja 1') returning id",
      [locationRows[0]?.id],
    );
    const { rows: installationRows } = await database.query<{ id: string }>(
      `insert into register_installations
         (register_id, token_lookup_prefix, token_hash, token_issued_at, hostname, windows_version, enrolled_at)
       values ($1, 'prefix', 'hash', now(), 'CAJA', 'Windows 11', now()) returning id`,
      [registerRows[0]?.id],
    );
    await database.query(
      "insert into device_state (device_id, last_pull_since, last_pulled_at) values ($1, 7, now())",
      [installationRows[0]?.id],
    );

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query(
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
    const { rows: inboxRows } = await migrated.query("select event_id from inbox");
    expect(inboxRows).toEqual([]);
  });
});
