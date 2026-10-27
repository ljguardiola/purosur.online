import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

const INSERT_TRANSACTION = `insert into payment_transactions
  (id, register_id, sale_id, kind, method, provider, card_type, amount, state, created_at, expires_at)
  values (gen_random_uuid(), $1, gen_random_uuid(), 'SALE', $2, $3, $4, 5000, 'PENDING', now(),
          now() + interval '5 minutes')`;

const INSERT_SALE_PAYMENT = `insert into sale_payments
  (id, sale_id, method, provider, card_type, amount, state, occurred_at)
  values (gen_random_uuid(), $1, $2, $3, $4, 100, 'APPROVED', now())`;

const POINT_TRANSACTION_ID = "00000000-0000-4000-8000-000000000301";
const POINT_PAYMENT_ID = "00000000-0000-4000-8000-000000000302";

async function databaseBefore() {
  const database = await databaseBeforeMigration("_point_card_type");
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
    `insert into sales
       (id, location_id, register_id, device_id, session_id, actor_id, state, total, applied_at)
     values (gen_random_uuid(), $1, $2, $3, $4, 'user-1', 'COMPLETED', 100, now()) returning id`,
    [locationId, registerId, deviceId, sessionId],
  );
  await database.query(
    `insert into sale_payments (id, sale_id, method, provider, amount, state, occurred_at)
     values ($1, $2, 'POINT', 'MERCADOPAGO_POINT', 100, 'APPROVED', now())`,
    [POINT_PAYMENT_ID, saleId],
  );
  await database.query(
    `insert into payment_transactions
       (id, register_id, sale_id, kind, method, provider, amount, state, created_at, expires_at)
     values ($1, $2, $3, 'SALE', 'POINT', 'MERCADOPAGO_POINT', 100, 'APPROVED', now(),
             now() + interval '5 minutes')`,
    [POINT_TRANSACTION_ID, registerId, saleId],
  );
  return { database, registerId, saleId };
}

describe("the Point card type migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps a Point transaction and a Point payment recorded before it, without a card type", async () => {
    const { database } = await databaseBefore();
    const migrated = await database.applyMigration();

    const transactions = await migrated.query("select id, card_type from payment_transactions");
    const payments = await migrated.query("select id, card_type from sale_payments");
    expect(transactions.rows).toEqual([{ id: POINT_TRANSACTION_ID, card_type: null }]);
    expect(payments.rows).toEqual([{ id: POINT_PAYMENT_ID, card_type: null }]);
  });

  it.each([
    ["accepts a DEBIT", "POINT", "MERCADOPAGO_POINT", "DEBIT", true],
    ["accepts a CREDIT", "POINT", "MERCADOPAGO_POINT", "CREDIT", true],
    ["accepts no", "POINT", "MERCADOPAGO_POINT", null, true],
    ["accepts no", "QR", "MERCADOPAGO_QR", null, true],
    [
      "refuses a card type no terminal charges as the",
      "POINT",
      "MERCADOPAGO_POINT",
      "PREPAID",
      false,
    ],
    ["refuses a DEBIT", "QR", "MERCADOPAGO_QR", "DEBIT", false],
  ])("%s card type on a %s transaction", async (_name, method, provider, cardType, accepted) => {
    const { database, registerId } = await databaseBefore();
    const migrated = await database.applyMigration();

    const insert = migrated.query(INSERT_TRANSACTION, [registerId, method, provider, cardType]);

    await (accepted ? expect(insert).resolves.toBeDefined() : expect(insert).rejects.toThrow());
  });

  it.each([
    ["accepts a CREDIT", "POINT", "MERCADOPAGO_POINT", "CREDIT", true],
    ["accepts no", "POINT", "MERCADOPAGO_POINT", null, true],
    ["accepts no", "CASH", "NONE", null, true],
    [
      "refuses a card type no terminal charges as the",
      "POINT",
      "MERCADOPAGO_POINT",
      "PREPAID",
      false,
    ],
    ["refuses a DEBIT", "CASH", "NONE", "DEBIT", false],
  ])("%s card type on a %s sale payment", async (_name, method, provider, cardType, accepted) => {
    const { database, saleId } = await databaseBefore();
    const migrated = await database.applyMigration();

    const insert = migrated.query(INSERT_SALE_PAYMENT, [saleId, method, provider, cardType]);

    await (accepted ? expect(insert).resolves.toBeDefined() : expect(insert).rejects.toThrow());
  });
});
