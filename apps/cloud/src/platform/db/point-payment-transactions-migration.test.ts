import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

const INSERT_TRANSACTION = `insert into payment_transactions
  (id, register_id, sale_id, kind, method, provider, amount, state, created_at, expires_at)
  values ($1, $2, gen_random_uuid(), 'SALE', $3, $4, 5000, 'PENDING', now(),
          now() + interval '5 minutes')`;

const QR_TRANSACTION_ID = "00000000-0000-4000-8000-000000000201";

async function databaseBefore() {
  const database = await databaseBeforeMigration("_point_payment_transactions");
  const { rows: registerRows } = await database.query<{ id: string }>(
    "insert into registers (location_id, name) select id, 'Caja 1' from locations limit 1 returning id",
  );
  const registerId = registerRows[0]?.id;
  await database.query(INSERT_TRANSACTION, [QR_TRANSACTION_ID, registerId, "QR", "MERCADOPAGO_QR"]);
  return { database, registerId };
}

describe("the point payment transactions migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps a pending QR transaction recorded before it", async () => {
    const { database } = await databaseBefore();
    const migrated = await database.applyMigration();

    const { rows } = await migrated.query(
      "select id, method, provider, state from payment_transactions",
    );
    expect(rows).toEqual([
      { id: QR_TRANSACTION_ID, method: "QR", provider: "MERCADOPAGO_QR", state: "PENDING" },
    ]);
  });

  it("accepts a transaction on the integrated terminal", async () => {
    const { database, registerId } = await databaseBefore();
    const migrated = await database.applyMigration();

    await migrated.query(INSERT_TRANSACTION, [
      crypto.randomUUID(),
      registerId,
      "POINT",
      "MERCADOPAGO_POINT",
    ]);

    const { rows } = await migrated.query(
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
    const { database, registerId } = await databaseBefore();
    const migrated = await database.applyMigration();

    await expect(
      migrated.query(INSERT_TRANSACTION, [crypto.randomUUID(), registerId, method, provider]),
    ).rejects.toThrow();
  });
});
