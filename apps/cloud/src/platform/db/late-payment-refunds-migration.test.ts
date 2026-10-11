import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, inject, it, onTestFinished } from "vitest";
import { migrateFreshDatabase } from "../../test-support/test-database-snapshot.js";
import {
  addMigrationEntry,
  findMigrationEntry,
  migrationsFolderBefore,
} from "./test-support/migration-journal-test-helpers.js";

async function latePaymentRefundsEntry() {
  return findMigrationEntry(
    "_late_payment_refunds",
    "test setup: no late payment refunds migration in the journal",
  );
}

async function databaseBefore() {
  const folder = await mkdtemp(join(tmpdir(), "late-payment-refunds-migration-"));
  onTestFinished(() => rm(folder, { recursive: true, force: true }));
  await migrationsFolderBefore(folder, await latePaymentRefundsEntry());
  const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
  onTestFinished(() => client.close());
  const { rows: locationRows } = await client.query<{ id: string }>(
    "select id from locations limit 1",
  );
  const { rows: registerRows } = await client.query<{ id: string }>(
    "insert into registers (location_id, name) values ($1, 'Caja 1') returning id",
    [locationRows[0]?.id],
  );
  const { rows: installationRows } = await client.query<{ id: string }>(
    `insert into register_installations
       (register_id, token_lookup_prefix, token_hash, token_issued_at, hostname, windows_version, enrolled_at)
     values ($1, 'prefix', 'hash', now(), 'CAJA', 'Windows 11', now()) returning id`,
    [registerRows[0]?.id],
  );
  const { rows: sessionRows } = await client.query<{ id: string }>(
    `insert into cash_sessions (id, location_id, register_id, device_id, opened_by, opened_at, opening_float)
     values (gen_random_uuid(), $1, $2, $3, 'user-1', now(), 0) returning id`,
    [locationRows[0]?.id, registerRows[0]?.id, installationRows[0]?.id],
  );
  const { rows: saleRows } = await client.query<{ id: string }>(
    `insert into sales
       (id, location_id, register_id, device_id, session_id, actor_id, state, cancelled_at, total, applied_at)
     values (gen_random_uuid(), $1, $2, $3, $4, 'user-1', 'CANCELLED', now(), 100, now()) returning id`,
    [locationRows[0]?.id, registerRows[0]?.id, installationRows[0]?.id, sessionRows[0]?.id],
  );
  const { rows: paymentRows } = await client.query<{ id: string }>(
    `insert into sale_payments (id, sale_id, method, provider, amount, state, occurred_at)
     values (gen_random_uuid(), $1, 'TRANSFER', 'NONE', 100, 'APPROVED', now()) returning id`,
    [saleRows[0]?.id],
  );
  await client.query(
    `insert into payment_refunds (id, sale_id, payment_id, method, provider, amount, state, occurred_at)
     values (gen_random_uuid(), $1, $2, 'TRANSFER', 'NONE', 100, 'PENDING', '2026-10-06T11:20:00Z')`,
    [saleRows[0]?.id, paymentRows[0]?.id],
  );
  async function newTransaction(): Promise<string> {
    const { rows } = await client.query<{ id: string }>(
      `insert into payment_transactions
         (id, register_id, sale_id, kind, method, provider, amount, state, replaced, created_at, expires_at)
       values (gen_random_uuid(), $1, gen_random_uuid(), 'SALE', 'QR', 'MERCADOPAGO_QR', 5000,
               'APPROVED', true, now(), now() + interval '5 minutes') returning id`,
      [registerRows[0]?.id],
    );
    const id = rows[0]?.id;
    if (!id) {
      throw new Error("test setup: inserting the payment transaction returned no row");
    }
    return id;
  }
  return {
    client,
    folder,
    saleId: saleRows[0]?.id,
    paymentId: paymentRows[0]?.id,
    newTransaction,
  };
}

async function databaseAfter() {
  const before = await databaseBefore();
  await addMigrationEntry(before.folder, await latePaymentRefundsEntry());
  await migrate(drizzle(before.client), { migrationsFolder: before.folder });
  return before;
}

describe("the late payment refunds migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps an existing refund as one of a cancelled sale, not discarded", async () => {
    const { client, folder } = await databaseBefore();

    await addMigrationEntry(folder, await latePaymentRefundsEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });

    const { rows } = await client.query(
      "select state, origin, payment_transaction_id, discarded_by, discarded_at from payment_refunds",
    );
    expect(rows).toEqual([
      {
        state: "PENDING",
        origin: "sale_cancelled",
        payment_transaction_id: null,
        discarded_by: null,
        discarded_at: null,
      },
    ]);
  });

  it("records the refund of a late payment against the payment transaction, with no sale payment", async () => {
    const { client, saleId, newTransaction } = await databaseAfter();
    const transactionId = await newTransaction();

    await expect(
      client.query(
        `insert into payment_refunds
           (id, sale_id, payment_transaction_id, origin, method, provider, amount, state, occurred_at)
         values (gen_random_uuid(), $1, $2, 'late_payment', 'QR', 'MERCADOPAGO_QR', 5000, 'PENDING', now())`,
        [saleId, transactionId],
      ),
    ).resolves.toBeDefined();
  });

  it("refuses a refund that names both a sale payment and a payment transaction, or neither", async () => {
    const { client, saleId, paymentId, newTransaction } = await databaseAfter();
    const transactionId = await newTransaction();
    const insertRefund = (payment: string | undefined, transaction: string | undefined) =>
      client.query(
        `insert into payment_refunds
           (id, sale_id, payment_id, payment_transaction_id, method, provider, amount, state, occurred_at)
         values (gen_random_uuid(), $1, $2, $3, 'TRANSFER', 'NONE', 100, 'PENDING', now())`,
        [saleId, payment ?? null, transaction ?? null],
      );

    await expect(insertRefund(paymentId, transactionId)).rejects.toThrow();
    await expect(insertRefund(undefined, undefined)).rejects.toThrow();
  });

  it("refuses a second refund of the same payment transaction", async () => {
    const { client, saleId, newTransaction } = await databaseAfter();
    const transactionId = await newTransaction();
    const insertRefund = () =>
      client.query(
        `insert into payment_refunds
           (id, sale_id, payment_transaction_id, origin, method, provider, amount, state, occurred_at)
         values (gen_random_uuid(), $1, $2, 'late_payment', 'QR', 'MERCADOPAGO_QR', 5000, 'PENDING', now())`,
        [saleId, transactionId],
      );

    await insertRefund();

    await expect(insertRefund()).rejects.toThrow();
  });

  it("refuses a refund of a payment transaction that is not recorded", async () => {
    const { client, saleId } = await databaseAfter();

    await expect(
      client.query(
        `insert into payment_refunds
           (id, sale_id, payment_transaction_id, origin, method, provider, amount, state, occurred_at)
         values (gen_random_uuid(), $1, gen_random_uuid(), 'late_payment', 'QR', 'MERCADOPAGO_QR', 5000, 'PENDING', now())`,
        [saleId],
      ),
    ).rejects.toThrow();
  });

  it("refuses an origin no refund has", async () => {
    const { client, saleId, paymentId } = await databaseAfter();

    await expect(
      client.query(
        `insert into payment_refunds (id, sale_id, payment_id, origin, method, provider, amount, state, occurred_at)
         values (gen_random_uuid(), $1, $2, 'manual', 'TRANSFER', 'NONE', 100, 'PENDING', now())`,
        [saleId, paymentId],
      ),
    ).rejects.toThrow();
  });

  it("records who discarded a refund and when, only on a discarded one", async () => {
    const { client, saleId, newTransaction } = await databaseAfter();
    const insertRefund = async (
      state: string,
      discardedBy: string | null,
      discardedAt: string | null,
      doneBy: string | null = null,
      doneAt: string | null = null,
    ) =>
      client.query(
        `insert into payment_refunds
           (id, sale_id, payment_transaction_id, origin, method, provider, amount, state, occurred_at,
            discarded_by, discarded_at, done_by, done_at)
         values (gen_random_uuid(), $1, $2, 'late_payment', 'QR', 'MERCADOPAGO_QR', 5000, $3, now(), $4, $5, $6, $7)`,
        [saleId, await newTransaction(), state, discardedBy, discardedAt, doneBy, doneAt],
      );

    await expect(
      insertRefund("DISCARDED", "user-3", "2026-10-07T10:00:00Z"),
    ).resolves.toBeDefined();
    await expect(insertRefund("PENDING", null, null)).resolves.toBeDefined();
    await expect(insertRefund("PENDING", "user-3", "2026-10-07T10:00:00Z")).rejects.toThrow();
    await expect(insertRefund("APPROVED", "user-3", "2026-10-07T10:00:00Z")).rejects.toThrow();
    await expect(insertRefund("DISCARDED", "user-3", null)).rejects.toThrow();
    await expect(insertRefund("DISCARDED", null, "2026-10-07T10:00:00Z")).rejects.toThrow();
    await expect(
      insertRefund("DISCARDED", "user-3", "2026-10-07T10:00:00Z", "user-4", "2026-10-07T10:00:00Z"),
    ).rejects.toThrow();
  });
});
