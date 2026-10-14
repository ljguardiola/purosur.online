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

  it("refuses a late-payment refund that names a cancelling event", async () => {
    const { database, saleId, transactionId } = await databaseBefore();
    const migrated = await database.applyMigration();

    await expect(
      migrated.query(
        `insert into payment_refunds
           (id, sale_id, payment_transaction_id, origin_event_id, origin, method, provider, amount, state, occurred_at)
         values (gen_random_uuid(), $1, $2, gen_random_uuid(), 'late_payment', 'QR', 'MERCADOPAGO_QR', 100, 'PENDING', now())`,
        [saleId, transactionId],
      ),
    ).rejects.toThrow(/payment_refunds_source_check/);
  });

  it("refuses a refund of a cancelled sale tied to no payment of the sale", async () => {
    const { database, saleId, transactionId } = await databaseBefore();
    const migrated = await database.applyMigration();

    await expect(
      migrated.query(
        `insert into payment_refunds
           (id, sale_id, payment_transaction_id, origin_event_id, origin, method, provider, amount, state, occurred_at)
         values (gen_random_uuid(), $1, $2, gen_random_uuid(), 'sale_cancelled', 'QR', 'MERCADOPAGO_QR', 100, 'PENDING', now())`,
        [saleId, transactionId],
      ),
    ).rejects.toThrow(/payment_refunds_source_check/);
  });

  it("keeps every recorded refund unconfirmed, unsent and unrefused", async () => {
    const { database } = await databaseBefore();

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query(
      `select confirmed_by, confirmed_at, sent_at, provider_refund_id, attempt_key, last_refusal_reason
         from payment_refunds`,
    );
    expect(rows).toEqual([
      {
        confirmed_by: null,
        confirmed_at: null,
        sent_at: null,
        provider_refund_id: null,
        attempt_key: null,
        last_refusal_reason: null,
      },
      {
        confirmed_by: null,
        confirmed_at: null,
        sent_at: null,
        provider_refund_id: null,
        attempt_key: null,
        last_refusal_reason: null,
      },
    ]);
  });

  describe("the progress of a refund sent by the cloud", () => {
    async function migratedWithRefund() {
      const { database, saleId, paymentId, transactionId } = await databaseBefore();
      const migrated = await database.applyMigration();
      const { rows } = await migrated.query<{ id: string }>(
        `insert into payment_refunds
           (id, sale_id, payment_id, payment_transaction_id, origin_event_id, origin, method, provider, amount, state, occurred_at)
         values (gen_random_uuid(), $1, $2, $3, gen_random_uuid(), 'sale_cancelled', 'QR', 'MERCADOPAGO_QR', 100, 'PENDING', now())
         returning id`,
        [saleId, paymentId, transactionId],
      );
      return { migrated, refundId: rows[0]?.id as string, saleId, paymentId, transactionId };
    }

    it("records the confirmation, the attempt, what Mercado Pago answered and why it refused", async () => {
      const { migrated, refundId } = await migratedWithRefund();

      await expect(
        migrated.query(
          `update payment_refunds
              set confirmed_by = 'manager', confirmed_at = now(), attempt_key = 'key-1',
                  sent_at = now(), provider_refund_id = 'REF-1', last_refusal_reason = 'insufficient_balance'
            where id = $1`,
          [refundId],
        ),
      ).resolves.toBeDefined();
    });

    it("refuses a confirmation recorded without who made it, or who without when", async () => {
      const { migrated, refundId } = await migratedWithRefund();

      await expect(
        migrated.query("update payment_refunds set confirmed_at = now() where id = $1", [refundId]),
      ).rejects.toThrow();
      await expect(
        migrated.query("update payment_refunds set confirmed_by = 'manager' where id = $1", [
          refundId,
        ]),
      ).rejects.toThrow();
    });

    it("refuses an attempt key or a sending of a refund nobody confirmed", async () => {
      const { migrated, refundId } = await migratedWithRefund();

      await expect(
        migrated.query("update payment_refunds set attempt_key = 'key-1' where id = $1", [
          refundId,
        ]),
      ).rejects.toThrow();
      await expect(
        migrated.query(
          "update payment_refunds set sent_at = now(), provider_refund_id = 'REF-1' where id = $1",
          [refundId],
        ),
      ).rejects.toThrow();
    });

    it("refuses a sending recorded without Mercado Pago's refund, or its refund without when", async () => {
      const { migrated, refundId } = await migratedWithRefund();
      const confirm =
        "update payment_refunds set confirmed_by = 'manager', confirmed_at = now(), %s where id = $1";

      await expect(
        migrated.query(confirm.replace("%s", "sent_at = now()"), [refundId]),
      ).rejects.toThrow();
      await expect(
        migrated.query(confirm.replace("%s", "provider_refund_id = 'REF-1'"), [refundId]),
      ).rejects.toThrow();
    });

    it("refuses an attempt key another refund already used", async () => {
      const { migrated, refundId, saleId, paymentId } = await migratedWithRefund();
      await migrated.query(
        "update payment_refunds set confirmed_by = 'manager', confirmed_at = now(), attempt_key = 'key-1' where id = $1",
        [refundId],
      );
      const { rows } = await migrated.query<{ id: string }>(
        `insert into payment_refunds
           (id, sale_id, payment_id, origin_event_id, origin, method, provider, amount, state, occurred_at, confirmed_by, confirmed_at)
         values (gen_random_uuid(), $1, $2, gen_random_uuid(), 'sale_cancelled', 'QR', 'MERCADOPAGO_QR', 100, 'PENDING', now(), 'manager', now())
         returning id`,
        [saleId, paymentId],
      );

      await expect(
        migrated.query("update payment_refunds set attempt_key = 'key-1' where id = $1", [
          rows[0]?.id,
        ]),
      ).rejects.toThrow();
    });
  });
});
