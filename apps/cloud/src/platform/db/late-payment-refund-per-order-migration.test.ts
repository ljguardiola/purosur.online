import { describe, expect, it } from "vitest";
import {
  databaseBeforeMigration,
  type SqlOnlyDatabase,
} from "./test-support/migration-under-test.js";

async function newTransaction(database: SqlOnlyDatabase, registerId: string | undefined) {
  const { rows } = await database.query<{ id: string }>(
    `insert into payment_transactions
       (id, register_id, sale_id, kind, method, provider, amount, state, replaced, created_at, expires_at)
     values (gen_random_uuid(), $1, gen_random_uuid(), 'SALE', 'QR', 'MERCADOPAGO_QR', 5000,
             'APPROVED', true, now(), now() + interval '5 minutes') returning id`,
    [registerId],
  );
  const id = rows[0]?.id;
  if (!id) {
    throw new Error("test setup: inserting the payment transaction returned no row");
  }
  return id;
}

async function databaseBefore() {
  const database = await databaseBeforeMigration("_late_payment_refund_per_order");
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
  const { rows: sessionRows } = await database.query<{ id: string }>(
    `insert into cash_sessions (id, location_id, register_id, device_id, opened_by, opened_at, opening_float)
     values (gen_random_uuid(), $1, $2, $3, 'user-1', now(), 0) returning id`,
    [locationRows[0]?.id, registerRows[0]?.id, installationRows[0]?.id],
  );
  const { rows: saleRows } = await database.query<{ id: string }>(
    `insert into sales
       (id, location_id, register_id, device_id, session_id, actor_id, state, cancelled_at, total, applied_at)
     values (gen_random_uuid(), $1, $2, $3, $4, 'user-1', 'CANCELLED', now(), 100, now()) returning id`,
    [locationRows[0]?.id, registerRows[0]?.id, installationRows[0]?.id, sessionRows[0]?.id],
  );
  const saleId = saleRows[0]?.id;
  const registerId = registerRows[0]?.id;
  const { rows: paymentRows } = await database.query<{ id: string }>(
    `insert into sale_payments (id, sale_id, method, provider, amount, state, occurred_at)
     values (gen_random_uuid(), $1, 'TRANSFER', 'NONE', 100, 'APPROVED', now()) returning id`,
    [saleId],
  );
  await database.query(
    `insert into payment_refunds (id, sale_id, payment_id, origin, method, provider, amount, state, occurred_at)
     values (gen_random_uuid(), $1, $2, 'sale_cancelled', 'TRANSFER', 'NONE', 100, 'PENDING', now())`,
    [saleId, paymentRows[0]?.id],
  );
  const lateTransactionId = await newTransaction(database, registerId);
  await database.query(
    `insert into payment_refunds
       (id, sale_id, payment_transaction_id, origin, method, provider, amount, state, occurred_at)
     values (gen_random_uuid(), $1, $2, 'late_payment', 'QR', 'MERCADOPAGO_QR', 5000, 'PENDING', now())`,
    [saleId, lateTransactionId],
  );
  return { database, registerId, saleId, lateTransactionId };
}

async function databaseAfter() {
  const { database, registerId, saleId, lateTransactionId } = await databaseBefore();
  const client = await database.applyMigration();
  return {
    client,
    saleId,
    lateTransactionId,
    newTransaction: () => newTransaction(client, registerId),
  };
}

function latePaymentRefundInserter(
  client: Awaited<ReturnType<typeof databaseAfter>>["client"],
  saleId: string | undefined,
) {
  return (transactionId: string, providerOrderId: string | null) =>
    client.query(
      `insert into payment_refunds
         (id, sale_id, payment_transaction_id, provider_order_id, origin, method, provider, amount, state, occurred_at)
       values (gen_random_uuid(), $1, $2, $3, 'late_payment', 'QR', 'MERCADOPAGO_QR', 5000, 'PENDING', now())`,
      [saleId, transactionId, providerOrderId],
    );
}

describe("the late payment refund per order migration applied over a database that already holds refunds", {
  timeout: 30_000,
}, () => {
  it("keeps every existing refund, naming no order", async () => {
    const { client, lateTransactionId } = await databaseAfter();

    const { rows } = await client.query(
      "select origin, payment_transaction_id, provider_order_id from payment_refunds order by origin",
    );
    expect(rows).toEqual([
      {
        origin: "late_payment",
        payment_transaction_id: lateTransactionId,
        provider_order_id: null,
      },
      { origin: "sale_cancelled", payment_transaction_id: null, provider_order_id: null },
    ]);
  });

  it("still refuses a second refund of a payment transaction that names no order", async () => {
    const { client, saleId, lateTransactionId } = await databaseAfter();
    const insertRefund = latePaymentRefundInserter(client, saleId);

    await expect(insertRefund(lateTransactionId, null)).rejects.toThrow();
  });

  it("records a refund for each other order of a payment transaction that already has one, once per order", async () => {
    const { client, saleId, lateTransactionId } = await databaseAfter();
    const insertRefund = latePaymentRefundInserter(client, saleId);

    await expect(insertRefund(lateTransactionId, "ORD01SECOND")).resolves.toBeDefined();
    await expect(insertRefund(lateTransactionId, "ORD01THIRD")).resolves.toBeDefined();
    await expect(insertRefund(lateTransactionId, "ORD01SECOND")).rejects.toThrow();
  });

  it("records a refund of an order for a payment transaction that has none yet", async () => {
    const { client, saleId, newTransaction } = await databaseAfter();
    const insertRefund = latePaymentRefundInserter(client, saleId);
    const transactionId = await newTransaction();

    await expect(insertRefund(transactionId, "ORD01SECOND")).resolves.toBeDefined();
    await expect(insertRefund(transactionId, null)).resolves.toBeDefined();
  });
});
