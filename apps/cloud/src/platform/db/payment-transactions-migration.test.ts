import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

async function databaseBefore() {
  const database = await databaseBeforeMigration("_payment_transactions");
  const { rows: registerRows } = await database.query<{ id: string }>(
    "insert into registers (location_id, name) select id, 'Caja 1' from locations limit 1 returning id",
  );
  const registerId = registerRows[0]?.id;
  const { rows: installationRows } = await database.query<{ id: string }>(
    `insert into register_installations
       (register_id, token_lookup_prefix, token_hash, token_issued_at, hostname, windows_version, enrolled_at)
     values ($1, 'prefix', 'hash', now(), 'caja-1', 'Windows 11', now()) returning id`,
    [registerId],
  );
  const installationId = installationRows[0]?.id;
  return { database, registerId, installationId };
}

const INSERT_TRANSACTION = `insert into payment_transactions
  (id, register_id, sale_id, kind, method, provider, amount, state, needs_review,
   provider_order_id, created_at, expires_at)
  values (gen_random_uuid(), $1, gen_random_uuid(), $2, $3, $4, $5, $6, $7, $8, now(),
          now() + interval '5 minutes')`;

const VALID = ["SALE", "QR", "MERCADOPAGO_QR", 5000, "PENDING", false, null] as const;

function transactionWith(overrides: Record<number, unknown>): unknown[] {
  return VALID.map((value, index) => (index in overrides ? overrides[index] : value));
}

describe("the payment transactions migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps the existing register and installation and starts with no payment transaction", async () => {
    const { database } = await databaseBefore();
    const migrated = await database.applyMigration();

    const { rows: registers } = await migrated.query("select name from registers");
    const { rows: installations } = await migrated.query(
      "select hostname from register_installations",
    );
    const { rows: transactions } = await migrated.query("select 1 from payment_transactions");
    expect(registers).toEqual([{ name: "Caja 1" }]);
    expect(installations).toEqual([{ hostname: "caja-1" }]);
    expect(transactions).toEqual([]);
  });

  it("accepts a pending transaction that has no order yet and one that has been read", async () => {
    const { database, registerId } = await databaseBefore();
    const migrated = await database.applyMigration();

    await migrated.query(INSERT_TRANSACTION, [registerId, ...VALID]);
    await migrated.query(INSERT_TRANSACTION, [
      registerId,
      ...transactionWith({ 3: 1234, 4: "APPROVED", 6: "ORD01" }),
    ]);

    const { rows } = await migrated.query(
      "select state, provider_order_id, state_read_at, needs_review, creation_outcome_unknown from payment_transactions order by amount",
    );
    expect(rows).toEqual([
      {
        state: "APPROVED",
        provider_order_id: "ORD01",
        state_read_at: null,
        needs_review: false,
        creation_outcome_unknown: false,
      },
      {
        state: "PENDING",
        provider_order_id: null,
        state_read_at: null,
        needs_review: false,
        creation_outcome_unknown: false,
      },
    ]);
  });

  it("accepts every state of a payment transaction", async () => {
    const { database, registerId } = await databaseBefore();
    const migrated = await database.applyMigration();

    for (const state of ["PENDING", "APPROVED", "DECLINED", "CANCELLED", "EXPIRED"]) {
      await migrated.query(INSERT_TRANSACTION, [registerId, ...transactionWith({ 4: state })]);
    }

    const { rows } = await migrated.query("select 1 from payment_transactions");
    expect(rows).toHaveLength(5);
  });

  it.each([
    ["an amount of zero", { 3: 0 }],
    ["a negative amount", { 3: -1 }],
    ["an unknown state", { 4: "REFUNDED" }],
    ["an unknown kind", { 0: "REFUND" }],
    ["an unknown method", { 1: "CARD" }],
    ["an unknown provider", { 2: "STRIPE" }],
  ])("refuses a transaction with %s", async (_name, overrides) => {
    const { database, registerId } = await databaseBefore();
    const migrated = await database.applyMigration();

    await expect(
      migrated.query(INSERT_TRANSACTION, [registerId, ...transactionWith(overrides)]),
    ).rejects.toThrow();
  });

  it("refuses a transaction of a register that does not exist", async () => {
    const { database } = await databaseBefore();
    const migrated = await database.applyMigration();

    await expect(
      migrated.query(INSERT_TRANSACTION, [crypto.randomUUID(), ...VALID]),
    ).rejects.toThrow();
  });

  it("refuses two transactions that share a provider order", async () => {
    const { database, registerId } = await databaseBefore();
    const migrated = await database.applyMigration();
    await migrated.query(INSERT_TRANSACTION, [registerId, ...transactionWith({ 6: "ORD01" })]);

    await expect(
      migrated.query(INSERT_TRANSACTION, [registerId, ...transactionWith({ 6: "ORD01" })]),
    ).rejects.toThrow();
  });

  it("keeps no column for the payment's own data", async () => {
    const { database } = await databaseBefore();
    const migrated = await database.applyMigration();

    const { rows } = await migrated.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name = 'payment_transactions' order by column_name",
    );
    expect(rows.map((row) => row.column_name)).toEqual([
      "amount",
      "created_at",
      "creation_outcome_unknown",
      "expires_at",
      "id",
      "kind",
      "method",
      "needs_review",
      "provider",
      "provider_order_id",
      "register_id",
      "sale_id",
      "state",
      "state_read_at",
    ]);
  });

  it("counts a payment order request of an installation against the limiter", async () => {
    const { database, installationId } = await databaseBefore();
    const migrated = await database.applyMigration();

    await migrated.query(
      "insert into installation_request_attempts (device_id, endpoint, attempted_at) values ($1, 'payment_order', now())",
      [installationId],
    );

    const { rows } = await migrated.query("select endpoint from installation_request_attempts");
    expect(rows).toEqual([{ endpoint: "payment_order" }]);
  });
});
