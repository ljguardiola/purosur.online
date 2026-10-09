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

async function saleStockMovementsEntry(): Promise<JournalEntry> {
  return findMigrationEntry(
    "_sale_stock_movements",
    "test setup: no sale stock movements migration in the journal",
  );
}

async function databaseBefore() {
  const folder = await mkdtemp(join(tmpdir(), "sale-stock-movements-migration-"));
  onTestFinished(() => rm(folder, { recursive: true, force: true }));
  await migrationsFolderBefore(folder, await saleStockMovementsEntry());
  const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
  onTestFinished(() => client.close());
  const first = async (sql: string, params: unknown[] = []) => {
    const { rows } = await client.query<{ id: string }>(sql, params);
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
  const categoryId = await first("insert into categories (name) values ('Almacen') returning id");
  const productId = await first(
    "insert into products (name, category_id, sale_unit) values ('Yerba', $1, 'UNIT') returning id",
    [categoryId],
  );
  const userId = await first(
    "insert into users (first_name, email, location_id) values ('Ada', 'ada@example.com', $1) returning id",
    [locationId],
  );
  const saleId = await first(
    `insert into sales (id, location_id, register_id, device_id, session_id, actor_id, state, completed_at, total, applied_at)
     values (gen_random_uuid(), $1, $2, $3, $4, $5, 'COMPLETED', now(), 2500, now()) returning id`,
    [locationId, registerId, deviceId, sessionId, userId],
  );
  const saleLineId = await first(
    `insert into sale_lines (id, sale_id, product_id, product_name, quantity, list_unit_price, price_list_id, discount_amount, line_total)
     values (gen_random_uuid(), $1, $2, 'Yerba', 1, 2500, gen_random_uuid(), 0, 2500) returning id`,
    [saleId, productId],
  );
  const insertMovement = (
    kind: string,
    reason: string | null,
    lineId: string | null,
    delta = -1000,
  ) =>
    client.query(
      `insert into stock_movements (product_id, location_id, kind, reason, delta, occurred_at, actor_id, sale_line_id)
       values ($1, $2, $3, $4, $5, now(), $6, $7)`,
      [productId, locationId, kind, reason, delta, userId, lineId],
    );
  return { client, folder, saleLineId, insertMovement, productId, locationId, userId };
}

describe("the sale stock movements migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps every recorded movement, none of them tied to a sale line", async () => {
    const { client, folder, productId, locationId, userId } = await databaseBefore();
    await client.query(
      `insert into stock_movements (product_id, location_id, kind, reason, delta, occurred_at, actor_id)
       values ($1, $2, 'loss', 'broken_or_spilled', -1000, now(), $3), ($1, $2, 'count', null, 0, now(), $3)`,
      [productId, locationId, userId],
    );

    await addMigrationEntry(folder, await saleStockMovementsEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });

    const { rows } = await client.query(
      "select kind, reason, delta, sale_line_id from stock_movements order by kind",
    );
    expect(rows).toEqual([
      { kind: "count", reason: null, delta: 0, sale_line_id: null },
      { kind: "loss", reason: "broken_or_spilled", delta: -1000, sale_line_id: null },
    ]);
  });

  it("records a sale's movement against its sale line, with no reason", async () => {
    const { client, folder, saleLineId, insertMovement } = await databaseBefore();
    await addMigrationEntry(folder, await saleStockMovementsEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });

    await insertMovement("sale", null, saleLineId);

    const { rows } = await client.query("select kind, reason, sale_line_id from stock_movements");
    expect(rows).toEqual([{ kind: "sale", reason: null, sale_line_id: saleLineId }]);
  });

  it("refuses a sale movement with a reason, without a sale line, or of a sale line that does not exist", async () => {
    const { client, folder, saleLineId, insertMovement } = await databaseBefore();
    await addMigrationEntry(folder, await saleStockMovementsEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });

    await expect(insertMovement("sale", "broken_or_spilled", saleLineId)).rejects.toThrow(
      /stock_movements_reason_unless_count_or_sale_check/,
    );
    await expect(insertMovement("sale", null, null)).rejects.toThrow(
      /stock_movements_sale_line_iff_sale_check/,
    );
    await expect(
      insertMovement("sale", null, "0d9c4f6e-2b1a-4c3d-8e5f-6a7b8c9d0e1f"),
    ).rejects.toThrow(/stock_movements_sale_line_id_sale_lines_id_fk/);
  });

  it("refuses a sale line on a movement that is not a sale's", async () => {
    const { client, folder, saleLineId, insertMovement } = await databaseBefore();
    await addMigrationEntry(folder, await saleStockMovementsEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });

    await expect(insertMovement("loss", "broken_or_spilled", saleLineId)).rejects.toThrow(
      /stock_movements_sale_line_iff_sale_check/,
    );
    await expect(insertMovement("count", null, saleLineId, 0)).rejects.toThrow(
      /stock_movements_sale_line_iff_sale_check/,
    );
  });
});
