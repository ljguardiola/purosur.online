import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

async function databaseBefore() {
  const database = await databaseBeforeMigration("_qr_cancellation_refunds");
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
       (id, location_id, register_id, device_id, session_id, actor_id, state, cancelled_at, total, applied_at)
     values (gen_random_uuid(), $1, $2, $3, $4, 'user-1', 'CANCELLED', now(), 100, now()) returning id`,
    [locationId, registerId, deviceId, sessionId],
  );
  const paymentId = await first(
    `insert into sale_payments (id, sale_id, method, provider, amount, state, occurred_at)
     values (gen_random_uuid(), $1, 'TRANSFER', 'NONE', 100, 'APPROVED', now()) returning id`,
    [saleId],
  );
  const newTransaction = () =>
    first(
      `insert into payment_transactions
         (id, register_id, sale_id, kind, method, provider, amount, state, replaced, created_at, expires_at)
       values (gen_random_uuid(), $1, $2, 'SALE', 'QR', 'MERCADOPAGO_QR', 100,
               'APPROVED', false, now(), now() + interval '5 minutes') returning id`,
      [registerId, saleId],
    );
  const transactionId = await newTransaction();
  const lateTransactionId = await newTransaction();
  await database.query(
    `insert into payment_refunds (id, sale_id, payment_id, origin, method, provider, amount, state, occurred_at)
     values (gen_random_uuid(), $1, $2, 'sale_cancelled', 'TRANSFER', 'NONE', 100, 'PENDING', now())`,
    [saleId, paymentId],
  );
  await database.query(
    `insert into payment_refunds
       (id, sale_id, payment_transaction_id, origin, method, provider, amount, state, occurred_at)
     values (gen_random_uuid(), $1, $2, 'late_payment', 'QR', 'MERCADOPAGO_QR', 100, 'PENDING', now())`,
    [saleId, lateTransactionId],
  );
  return { database, saleId, paymentId, transactionId };
}

describe("the QR cancellation refunds migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps every recorded refund, none of them with an origin event", async () => {
    const { database } = await databaseBefore();

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query(
      "select origin, origin_event_id from payment_refunds order by origin",
    );
    expect(rows).toEqual([
      { origin: "late_payment", origin_event_id: null },
      { origin: "sale_cancelled", origin_event_id: null },
    ]);
  });

  it("accepts a refund of a cancelled sale tied to both its payment and the provider's transaction", async () => {
    const { database, saleId, paymentId, transactionId } = await databaseBefore();
    const migrated = await database.applyMigration();

    await expect(
      migrated.query(
        `insert into payment_refunds
           (id, sale_id, payment_id, payment_transaction_id, origin_event_id, origin, method, provider, amount, state, occurred_at)
         values (gen_random_uuid(), $1, $2, $3, gen_random_uuid(), 'sale_cancelled', 'QR', 'MERCADOPAGO_QR', 100, 'PENDING', now())`,
        [saleId, paymentId, transactionId],
      ),
    ).resolves.toBeDefined();
  });

  it("refuses a late-payment refund tied to a sale payment", async () => {
    const { database, saleId, paymentId, transactionId } = await databaseBefore();
    const migrated = await database.applyMigration();

    await expect(
      migrated.query(
        `insert into payment_refunds
           (id, sale_id, payment_id, payment_transaction_id, origin, method, provider, amount, state, occurred_at, provider_order_id)
         values (gen_random_uuid(), $1, $2, $3, 'late_payment', 'QR', 'MERCADOPAGO_QR', 100, 'PENDING', now(), 'order-2')`,
        [saleId, paymentId, transactionId],
      ),
    ).rejects.toThrow();
  });
});
