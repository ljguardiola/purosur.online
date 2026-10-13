import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

describe("the sync changes migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("logs every branch's current settings as a change, so a register pulling from the start receives them", async () => {
    const database = await databaseBeforeMigration("_sync_changes");

    const { rows: locationRows } = await database.query<{ id: string }>(
      "select id from locations limit 1",
    );
    const locationId = locationRows[0]?.id;
    await database.query(
      "update branch_settings set address = 'Av. Belgrano 1450', version = 4 where location_id = $1",
      [locationId],
    );
    const { rows: registerRows } = await database.query<{ id: string }>(
      "insert into registers (location_id, name) values ($1, 'Caja 1') returning id",
      [locationId],
    );
    const { rows: installationRows } = await database.query<{ id: string }>(
      `insert into register_installations
         (register_id, token_lookup_prefix, token_hash, token_issued_at, hostname, windows_version, enrolled_at)
       values ($1, 'prefix', 'hash', now(), 'CAJA', 'Windows 11', now()) returning id`,
      [registerRows[0]?.id],
    );

    const migrated = await database.applyMigration();

    const { rows: changes } = await migrated.query(
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
      migrated.query(
        `insert into device_state (device_id, last_pull_since, last_pulled_at)
         values ($1, 1, now()) returning device_id`,
        [installationRows[0]?.id],
      ),
    ).resolves.toMatchObject({ rows: [{ device_id: installationRows[0]?.id }] });
  });
});
