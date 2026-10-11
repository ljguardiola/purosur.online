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

async function replacedEntry() {
  return findMigrationEntry(
    "_replaced_payment_transactions",
    "test setup: no replaced payment transactions migration in the journal",
  );
}

describe("the replaced payment transactions migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps an existing payment transaction and marks it as not replaced", async () => {
    const folder = await mkdtemp(join(tmpdir(), "replaced-payment-transactions-migration-"));
    onTestFinished(() => rm(folder, { recursive: true, force: true }));
    await migrationsFolderBefore(folder, await replacedEntry());
    const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
    onTestFinished(() => client.close());
    const { rows: registerRows } = await client.query<{ id: string }>(
      "insert into registers (location_id, name) select id, 'Caja 1' from locations limit 1 returning id",
    );
    await client.query(
      `insert into payment_transactions
         (id, register_id, sale_id, kind, method, provider, amount, state, created_at, expires_at)
       values (gen_random_uuid(), $1, gen_random_uuid(), 'SALE', 'QR', 'MERCADOPAGO_QR', 5000,
               'PENDING', now(), now() + interval '5 minutes')`,
      [registerRows[0]?.id],
    );

    await addMigrationEntry(folder, await replacedEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });

    const { rows } = await client.query("select amount, replaced from payment_transactions");
    expect(rows).toEqual([{ amount: 5000, replaced: false }]);
  });
});
