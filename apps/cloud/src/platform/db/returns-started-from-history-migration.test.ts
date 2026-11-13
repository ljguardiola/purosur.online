import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

async function databaseBefore() {
  const database = await databaseBeforeMigration("_returns_started_from_history");
  const first = async (sql: string, params: unknown[] = []) => {
    const { rows } = await database.query<{ id: string }>(sql, params);
    return rows[0]?.id as string;
  };
  const locationId = await first("select id from locations limit 1");
  const registerId = await first(
    "insert into registers (location_id, name) values ($1, 'Caja 1') returning id",
    [locationId],
  );
  const deviceId = await first(
    `insert into register_installations
       (register_id, token_lookup_prefix, token_hash, token_issued_at, hostname, windows_version, enrolled_at)
     values ($1, 'prefix', 'hash', now(), 'CAJA', 'Windows 11', now()) returning id`,
    [registerId],
  );
  const sessionId = await first(
    `insert into cash_sessions (id, location_id, register_id, device_id, opened_by, opened_at, opening_float)
     values (gen_random_uuid(), $1, $2, $3, 'user-1', now(), 0) returning id`,
    [locationId, registerId, deviceId],
  );
  const saleId = await first(
    `insert into sales (id, location_id, register_id, device_id, session_id, actor_id, state, completed_at, total, applied_at)
     values (gen_random_uuid(), $1, $2, $3, $4, 'user-1', 'COMPLETED', '2026-10-06T11:20:00Z', 4800, now()) returning id`,
    [locationId, registerId, deviceId, sessionId],
  );
  const insertReturnInto = (target: { query: typeof database.query }, ticketSource: string) =>
    target.query<{ id: string }>(
      `insert into returns (id, sale_id, register_id, device_id, session_id, actor_id, ticket_source, occurred_at, origin_event_id)
       values (gen_random_uuid(), $1, $2, $3, $4, 'user-1', $5, '2026-10-08T10:00:00Z', gen_random_uuid())
       returning id`,
      [saleId, registerId, deviceId, sessionId, ticketSource],
    );
  const insertReturn = async (ticketSource: string) =>
    (await insertReturnInto(database, ticketSource)).rows[0]?.id as string;
  return { database, insertReturn, insertReturnInto };
}

describe("the returns started from the history migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps the returns a branch already made, scanned and typed", async () => {
    const { database, insertReturn } = await databaseBefore();
    const scanned = await insertReturn("QR");
    const typed = await insertReturn("TYPED");

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query<{ id: string; ticket_source: string }>(
      "select id, ticket_source from returns order by ticket_source",
    );
    expect(rows).toEqual([
      { id: scanned, ticket_source: "QR" },
      { id: typed, ticket_source: "TYPED" },
    ]);
  });

  it("accepts a return started from the history and still refuses a source nobody reads", async () => {
    const { database, insertReturnInto } = await databaseBefore();
    const migrated = await database.applyMigration();

    const { rows } = await insertReturnInto(migrated, "HISTORY");

    expect(rows).toHaveLength(1);
    await expect(insertReturnInto(migrated, "SCAN")).rejects.toThrow(/returns_ticket_source_check/);
  });
});
