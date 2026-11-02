import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

const SELLER = "seller-1";
const VOIDER = "voider-1";

async function databaseBefore() {
  const database = await databaseBeforeMigration("_sale_voided_by");
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
  let deviceSeq = 0;
  const insertSale = (state: "COMPLETED" | "VOIDED") =>
    first(
      `insert into sales (id, location_id, register_id, device_id, session_id, actor_id, state, completed_at, voided_at, total, applied_at)
       values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, '2026-10-06T11:20:00Z', $7, 4800, now()) returning id`,
      [
        locationId,
        registerId,
        deviceId,
        sessionId,
        SELLER,
        state,
        state === "VOIDED" ? "2026-10-06T11:40:00Z" : null,
      ],
    );
  const insertEvent = (
    saleId: string,
    actorId: string,
    appliedAt: string | null = "2026-10-06T11:40:05Z",
    eventType = "sale_voided",
  ) => {
    deviceSeq += 1;
    return database.query(
      `insert into inbox
         (event_id, device_id, device_seq, aggregate_type, aggregate_id, event_type, schema_version,
          payload, occurred_at, actor_id, chain_hmac, received_at, applied_at)
       values (gen_random_uuid(), $1, $2, 'Sale', $3, $4, 1, $5::jsonb,
               '2026-10-06T11:40:00Z', $6, 'hmac', '2026-10-06T11:40:01Z', $7)`,
      [
        deviceId,
        deviceSeq,
        saleId,
        eventType,
        JSON.stringify({ actor_id: SELLER }),
        actorId,
        appliedAt,
      ],
    );
  };
  return { database, insertSale, insertEvent };
}

describe("the sale voided by migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("fills who voided a voided sale from the actor of the applied event that voided it, not from the seller", async () => {
    const { database, insertSale, insertEvent } = await databaseBefore();
    const voidedSale = await insertSale("VOIDED");
    await insertEvent(voidedSale, "someone-else", null);
    await insertEvent(voidedSale, "someone-else-too", "2026-10-06T11:30:00Z", "sale_completed");
    await insertEvent(voidedSale, VOIDER);

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query("select actor_id, voided_by from sales where id = $1", [
      voidedSale,
    ]);
    expect(rows).toEqual([{ actor_id: SELLER, voided_by: VOIDER }]);
  });

  it("leaves a sale that was never voided without anyone who voided it", async () => {
    const { database, insertSale, insertEvent } = await databaseBefore();
    const completedSale = await insertSale("COMPLETED");
    await insertEvent(completedSale, VOIDER);

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query("select voided_by from sales where id = $1", [
      completedSale,
    ]);
    expect(rows).toEqual([{ voided_by: null }]);
  });

  it("leaves a voided sale with no applied voiding event without anyone who voided it", async () => {
    const { database, insertSale } = await databaseBefore();
    const voidedSale = await insertSale("VOIDED");

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query("select voided_by from sales where id = $1", [
      voidedSale,
    ]);
    expect(rows).toEqual([{ voided_by: null }]);
  });

  it("still voids a sale without recording who voided it, as the previous release does during a deploy", async () => {
    const { database, insertSale } = await databaseBefore();
    const completedSale = await insertSale("COMPLETED");
    const migrated = await database.applyMigration();

    await migrated.query(
      "update sales set state = 'VOIDED', voided_at = now(), void_authorized_by = 'boss-1' where id = $1",
      [completedSale],
    );
    await insertSale("VOIDED");

    const { rows } = await migrated.query("select state, voided_by from sales order by state");
    expect(rows).toEqual([
      { state: "VOIDED", voided_by: null },
      { state: "VOIDED", voided_by: null },
    ]);
  });
});
