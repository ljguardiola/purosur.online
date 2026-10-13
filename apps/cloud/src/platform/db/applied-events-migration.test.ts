import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

describe("the apply synced events migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps every event already received as unapplied, unquarantined and never attempted", async () => {
    const database = await databaseBeforeMigration("_apply_synced_events");
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
    const { rows: eventRows } = await database.query<{ event_id: string }>(
      `insert into inbox
         (event_id, device_id, device_seq, aggregate_type, aggregate_id, event_type, schema_version,
          payload, occurred_at, actor_id, chain_hmac, received_at)
       values (gen_random_uuid(), $1, 1, 'CashSession', 'session-1', 'cash_session_opened', 1,
               '{}'::jsonb, now(), 'user-1', 'hmac', now()) returning event_id`,
      [installationRows[0]?.id],
    );

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query(
      `select event_id, applied_at, attempts, next_attempt_at, quarantined_at, last_error from inbox`,
    );
    expect(rows).toEqual([
      {
        event_id: eventRows[0]?.event_id,
        applied_at: null,
        attempts: 0,
        next_attempt_at: null,
        quarantined_at: null,
        last_error: null,
      },
    ]);
    for (const table of [
      "sales",
      "sale_lines",
      "sale_payments",
      "cash_sessions",
      "cash_movements",
    ]) {
      const { rows: appliedRows } = await migrated.query(`select 1 from ${table}`);
      expect(appliedRows).toEqual([]);
    }
  });
});
