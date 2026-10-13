import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

async function databaseBefore() {
  const database = await databaseBeforeMigration("_reports_every_cycle");
  const { rows: locationRows } = await database.query<{ id: string }>(
    "select id from locations limit 1",
  );
  const installation = async (name: string) => {
    const { rows: registerRows } = await database.query<{ id: string }>(
      "insert into registers (location_id, name) values ($1, $2) returning id",
      [locationRows[0]?.id, name],
    );
    const { rows } = await database.query<{ id: string }>(
      `insert into register_installations
         (register_id, token_lookup_prefix, token_hash, token_issued_at, hostname, windows_version, enrolled_at)
       values ($1, $2, 'hash', now(), $2, 'Windows 11', now()) returning id`,
      [registerRows[0]?.id, name],
    );
    const id = rows[0]?.id;
    if (!id) throw new Error("test setup: inserting the installation returned no row");
    return id;
  };
  return { database, installation };
}

describe("the reports-every-cycle migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps each installation's device state and knows none of them to report on every sync cycle", async () => {
    const { database, installation } = await databaseBefore();
    const deviceId = await installation("Caja 1");
    await database.query(
      `insert into device_state (device_id, last_pushed_at, last_accepted_push_at)
       values ($1, '2026-10-06T12:00:00Z', '2026-10-06T11:20:00Z')`,
      [deviceId],
    );

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query(
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
