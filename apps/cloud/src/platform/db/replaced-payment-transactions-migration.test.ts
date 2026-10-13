import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

describe("the replaced payment transactions migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps an existing payment transaction and marks it as not replaced", async () => {
    const database = await databaseBeforeMigration("_replaced_payment_transactions");
    const { rows: registerRows } = await database.query<{ id: string }>(
      "insert into registers (location_id, name) select id, 'Caja 1' from locations limit 1 returning id",
    );
    await database.query(
      `insert into payment_transactions
         (id, register_id, sale_id, kind, method, provider, amount, state, created_at, expires_at)
       values (gen_random_uuid(), $1, gen_random_uuid(), 'SALE', 'QR', 'MERCADOPAGO_QR', 5000,
               'PENDING', now(), now() + interval '5 minutes')`,
      [registerRows[0]?.id],
    );

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query("select amount, replaced from payment_transactions");
    expect(rows).toEqual([{ amount: 5000, replaced: false }]);
  });
});
