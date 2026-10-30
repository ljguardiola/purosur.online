import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

async function first(
  database: Awaited<ReturnType<typeof databaseBeforeMigration>>,
  sql: string,
  params: unknown[] = [],
): Promise<string> {
  const { rows } = await database.query<{ id: string }>(sql, params);
  const id = rows[0]?.id;
  if (!id) {
    throw new Error("test setup: the insert returned no row");
  }
  return id;
}

async function databaseBefore() {
  const database = await databaseBeforeMigration("_return_refunds_of_one_payment");
  const locationId = await first(database, "select id from locations limit 1");
  const registerId = await first(
    database,
    "insert into registers (location_id, name) values ($1, 'Caja 1') returning id",
    [locationId],
  );
  const deviceId = await first(
    database,
    `insert into register_installations
       (register_id, token_lookup_prefix, token_hash, token_issued_at, hostname, windows_version, enrolled_at)
     values ($1, 'prefix', 'hash', now(), 'CAJA', 'Windows 11', now()) returning id`,
    [registerId],
  );
  const sessionId = await first(
    database,
    `insert into cash_sessions (id, location_id, register_id, device_id, opened_by, opened_at, opening_float)
     values (gen_random_uuid(), $1, $2, $3, 'user-1', now(), 0) returning id`,
    [locationId, registerId, deviceId],
  );
  const saleId = await first(
    database,
    `insert into sales
       (id, location_id, register_id, device_id, session_id, actor_id, state, completed_at, voided_at, void_authorized_by, total, applied_at)
     values (gen_random_uuid(), $1, $2, $3, $4, 'user-1', 'VOIDED', now(), now(), 'user-2', 5000, now()) returning id`,
    [locationId, registerId, deviceId, sessionId],
  );
  const transaction = () =>
    first(
      database,
      `insert into payment_transactions
         (id, register_id, sale_id, kind, method, provider, amount, state, replaced, created_at, expires_at)
       values (gen_random_uuid(), $1, $2, 'SALE', 'QR', 'MERCADOPAGO_QR', 5000,
               'APPROVED', false, now(), now() + interval '5 minutes') returning id`,
      [registerId, saleId],
    );
  const voidedPaymentId = await transaction();
  await database.query(
    `insert into sale_payments (id, sale_id, method, provider, amount, state, occurred_at)
     values ($1, $2, 'QR', 'MERCADOPAGO_QR', 5000, 'APPROVED', now())`,
    [voidedPaymentId, saleId],
  );
  await database.query(
    `insert into payment_refunds
       (id, sale_id, payment_id, payment_transaction_id, origin, method, provider, amount, state, occurred_at)
     values (gen_random_uuid(), $1, $2, $2, 'sale_voided', 'QR', 'MERCADOPAGO_QR', 5000, 'PENDING', now())`,
    [saleId, voidedPaymentId],
  );
  const lateTransactionId = await transaction();
  await database.query(
    `insert into payment_refunds
       (id, sale_id, payment_transaction_id, origin, method, provider, amount, state, occurred_at)
     values (gen_random_uuid(), $1, $2, 'late_payment', 'QR', 'MERCADOPAGO_QR', 5000, 'PENDING', now())`,
    [saleId, lateTransactionId],
  );
  return { database, saleId, lateTransactionId, newTransaction: transaction };
}

describe("the migration that lets one payment have several return refunds, applied over existing data", {
  timeout: 30_000,
}, () => {
  it("keeps the refund of a voided sale and the refund of a late payment", async () => {
    const { database } = await databaseBefore();

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query(
      "select origin, state, amount from payment_refunds order by origin",
    );
    expect(rows).toEqual([
      { origin: "late_payment", state: "PENDING", amount: 5000 },
      { origin: "sale_voided", state: "PENDING", amount: 5000 },
    ]);
  });

  it("still refuses a second refund of the same late payment", async () => {
    const { database, saleId, lateTransactionId } = await databaseBefore();
    const migrated = await database.applyMigration();

    await expect(
      migrated.query(
        `insert into payment_refunds
           (id, sale_id, payment_transaction_id, origin, method, provider, amount, state, occurred_at)
         values (gen_random_uuid(), $1, $2, 'late_payment', 'QR', 'MERCADOPAGO_QR', 5000, 'PENDING', now())`,
        [saleId, lateTransactionId],
      ),
    ).rejects.toThrow(/payment_refunds_transaction_without_order_unique/);
  });

  it("takes two partial return refunds of the same payment", async () => {
    const { database, saleId, newTransaction } = await databaseBefore();
    const migrated = await database.applyMigration();
    const transactionId = await newTransaction();
    await migrated.query(
      `insert into sale_payments (id, sale_id, method, provider, amount, state, occurred_at)
       values ($1, $2, 'QR', 'MERCADOPAGO_QR', 5000, 'APPROVED', now())`,
      [transactionId, saleId],
    );
    const insertReturnRefund = (amount: number) =>
      migrated.query(
        `insert into payment_refunds
           (id, sale_id, payment_id, payment_transaction_id, origin, method, provider, amount, state, occurred_at)
         values (gen_random_uuid(), $1, $2, $2, 'return', 'QR', 'MERCADOPAGO_QR', $3, 'PENDING', now())`,
        [saleId, transactionId, amount],
      );

    await insertReturnRefund(1000);
    await insertReturnRefund(1500);

    const { rows } = await migrated.query(
      "select amount from payment_refunds where origin = 'return' order by amount",
    );
    expect(rows).toEqual([{ amount: 1000 }, { amount: 1500 }]);
  });
});
