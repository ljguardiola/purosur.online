import { databaseBeforeMigration } from "./migration-under-test.js";

export const SELLER = "seller-1";
export const VOIDER = "voider-1";

export async function databaseWithSalesBefore(tagSuffix: string) {
  const database = await databaseBeforeMigration(tagSuffix);
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
