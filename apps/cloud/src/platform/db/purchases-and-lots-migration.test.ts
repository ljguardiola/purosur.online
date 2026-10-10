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
  type JournalEntry,
  migrationsFolderBefore,
} from "./test-support/migration-journal-test-helpers.js";

const MISSING_ID = "0d9c4f6e-2b1a-4c3d-8e5f-6a7b8c9d0e1f";

async function purchasesAndLotsEntry(): Promise<JournalEntry> {
  return findMigrationEntry(
    "_purchases_and_lots",
    "test setup: no purchases and lots migration in the journal",
  );
}

async function databaseBefore() {
  const folder = await mkdtemp(join(tmpdir(), "purchases-and-lots-migration-"));
  onTestFinished(() => rm(folder, { recursive: true, force: true }));
  await migrationsFolderBefore(folder, await purchasesAndLotsEntry());
  const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
  onTestFinished(() => client.close());
  const first = async (sql: string, params: unknown[] = []) => {
    const { rows } = await client.query<{ id: string }>(sql, params);
    return rows[0]?.id as string;
  };
  const locationId = await first("select id from locations limit 1");
  const categoryId = await first("insert into categories (name) values ('Almacen') returning id");
  const productId = await first(
    "insert into products (name, category_id, sale_unit) values ('Yerba', $1, 'UNIT') returning id",
    [categoryId],
  );
  const userId = await first(
    "insert into users (first_name, email, location_id) values ('Ada', 'ada@example.com', $1) returning id",
    [locationId],
  );
  return { client, folder, productId, locationId, userId, first };
}

describe("the purchases and lots migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps every recorded movement, none of them tied to a purchase line", async () => {
    const { client, folder, productId, locationId, userId } = await databaseBefore();
    await client.query(
      `insert into stock_movements (product_id, location_id, kind, reason, delta, occurred_at, actor_id)
       values ($1, $2, 'loss', 'broken_or_spilled', -1000, now(), $3), ($1, $2, 'count', null, 0, now(), $3)`,
      [productId, locationId, userId],
    );

    await addMigrationEntry(folder, await purchasesAndLotsEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });

    const { rows } = await client.query(
      "select kind, reason, delta, purchase_line_id from stock_movements order by kind",
    );
    expect(rows).toEqual([
      { kind: "count", reason: null, delta: 0, purchase_line_id: null },
      { kind: "loss", reason: "broken_or_spilled", delta: -1000, purchase_line_id: null },
    ]);
  });

  async function migratedWithPurchaseLine() {
    const database = await databaseBefore();
    const { client, folder, first, productId, locationId, userId } = database;
    await addMigrationEntry(folder, await purchasesAndLotsEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });
    const supplierId = await first(
      "insert into suppliers (name, actor_id) values ('Distribuidora Sur', $1) returning id",
      [userId],
    );
    const purchaseId = await first(
      `insert into purchases (supplier_id, location_id, purchased_on, receipt_type, recorded_at, actor_id)
       values ($1, $2, '2026-10-01', 'sin_comprobante', now(), $3) returning id`,
      [supplierId, locationId, userId],
    );
    const purchaseLineId = await first(
      `insert into purchase_lines (purchase_id, position, product_id, quantity, cost_paid_cents, quantity_per_package)
       values ($1, 1, $2, 1000, 500, 1000) returning id`,
      [purchaseId, productId],
    );
    const insertReceipt = (reason: string | null, lineId: string | null) =>
      client.query(
        `insert into stock_movements (product_id, location_id, kind, reason, delta, occurred_at, actor_id, purchase_line_id)
         values ($1, $2, 'receipt', $3, 1000, now(), $4, $5)`,
        [productId, locationId, reason, userId, lineId],
      );
    return { ...database, purchaseLineId, insertReceipt };
  }

  it("records a purchase line's receipt movement against it, with no reason", async () => {
    const { client, purchaseLineId, insertReceipt } = await migratedWithPurchaseLine();

    await insertReceipt(null, purchaseLineId);

    const { rows } = await client.query(
      "select kind, reason, purchase_line_id from stock_movements",
    );
    expect(rows).toEqual([{ kind: "receipt", reason: null, purchase_line_id: purchaseLineId }]);
  });

  it("refuses a receipt movement with a reason, without a purchase line, or of a line that does not exist", async () => {
    const { purchaseLineId, insertReceipt } = await migratedWithPurchaseLine();

    await expect(insertReceipt("broken_or_spilled", purchaseLineId)).rejects.toThrow(
      /stock_movements_reason_unless_count_sale_or_receipt_check/,
    );
    await expect(insertReceipt(null, null)).rejects.toThrow(
      /stock_movements_purchase_line_iff_receipt_check/,
    );
    await expect(insertReceipt(null, MISSING_ID)).rejects.toThrow(
      /stock_movements_purchase_line_id_purchase_lines_id_fk/,
    );
  });

  it("refuses a purchase line on a movement that is not a receipt", async () => {
    const { client, purchaseLineId, productId, locationId, userId } =
      await migratedWithPurchaseLine();

    await expect(
      client.query(
        `insert into stock_movements (product_id, location_id, kind, reason, delta, occurred_at, actor_id, purchase_line_id)
         values ($1, $2, 'loss', 'broken_or_spilled', -1000, now(), $3, $4)`,
        [productId, locationId, userId, purchaseLineId],
      ),
    ).rejects.toThrow(/stock_movements_purchase_line_iff_receipt_check/);
  });
});
