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

async function pointPaymentTransactionsEntry() {
  return findMigrationEntry(
    "_point_payment_transactions",
    "test setup: no point payment transactions migration in the journal",
  );
}

const INSERT_TRANSACTION = `insert into payment_transactions
  (id, register_id, sale_id, kind, method, provider, amount, state, created_at, expires_at)
  values ($1, $2, gen_random_uuid(), 'SALE', $3, $4, 5000, 'PENDING', now(),
          now() + interval '5 minutes')`;

const QR_TRANSACTION_ID = "00000000-0000-4000-8000-000000000201";

async function databaseBefore() {
  const folder = await mkdtemp(join(tmpdir(), "point-payment-transactions-migration-"));
  onTestFinished(() => rm(folder, { recursive: true, force: true }));
  await migrationsFolderBefore(folder, await pointPaymentTransactionsEntry());
  const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
  onTestFinished(() => client.close());
  const { rows: registerRows } = await client.query<{ id: string }>(
    "insert into registers (location_id, name) select id, 'Caja 1' from locations limit 1 returning id",
  );
  const registerId = registerRows[0]?.id;
  await client.query(INSERT_TRANSACTION, [QR_TRANSACTION_ID, registerId, "QR", "MERCADOPAGO_QR"]);
  const applyMigration = async () => {
    await addMigrationEntry(folder, await pointPaymentTransactionsEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });
  };
  return { client, registerId, applyMigration };
}

describe("the point payment transactions migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps a pending QR transaction recorded before it", async () => {
    const { client, applyMigration } = await databaseBefore();

    await applyMigration();

    const { rows } = await client.query(
      "select id, method, provider, state from payment_transactions",
    );
    expect(rows).toEqual([
      { id: QR_TRANSACTION_ID, method: "QR", provider: "MERCADOPAGO_QR", state: "PENDING" },
    ]);
  });

  it("accepts a transaction on the integrated terminal", async () => {
    const { client, registerId, applyMigration } = await databaseBefore();
    await applyMigration();

    await client.query(INSERT_TRANSACTION, [
      crypto.randomUUID(),
      registerId,
      "POINT",
      "MERCADOPAGO_POINT",
    ]);

    const { rows } = await client.query(
      "select method, provider from payment_transactions order by method",
    );
    expect(rows).toEqual([
      { method: "POINT", provider: "MERCADOPAGO_POINT" },
      { method: "QR", provider: "MERCADOPAGO_QR" },
    ]);
  });

  it.each([
    ["a QR payment through the integrated terminal's provider", "QR", "MERCADOPAGO_POINT"],
    ["a terminal payment through the QR's provider", "POINT", "MERCADOPAGO_QR"],
    ["an unknown method", "CARD", "MERCADOPAGO_POINT"],
    ["an unknown provider", "POINT", "STRIPE"],
  ])("refuses %s", async (_name, method, provider) => {
    const { client, registerId, applyMigration } = await databaseBefore();
    await applyMigration();

    await expect(
      client.query(INSERT_TRANSACTION, [crypto.randomUUID(), registerId, method, provider]),
    ).rejects.toThrow();
  });
});
