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

async function stockCountLotsEntry(): Promise<JournalEntry> {
  return findMigrationEntry(
    "_stock_count_lots",
    "test setup: no stock count lots migration in the journal",
  );
}

async function databaseHoldingACount() {
  const folder = await mkdtemp(join(tmpdir(), "stock-count-lots-migration-"));
  onTestFinished(() => rm(folder, { recursive: true, force: true }));
  await migrationsFolderBefore(folder, await stockCountLotsEntry());
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
  const movementId = await first(
    `insert into stock_movements (product_id, location_id, kind, delta, occurred_at, actor_id)
     values ($1, $2, 'count', 0, now(), $3) returning id`,
    [productId, locationId, userId],
  );
  await client.query(
    "insert into stock_counts (movement_id, counted, expected) values ($1, 1000, 1000)",
    [movementId],
  );
  const lotId = await first(
    `insert into lots (product_id, location_id, quantity_received, technical, cost_incomplete)
     values ($1, $2, 0, true, true) returning id`,
    [productId, locationId],
  );
  return { client, folder, movementId, lotId };
}

async function migrated() {
  const database = await databaseHoldingACount();
  await addMigrationEntry(database.folder, await stockCountLotsEntry());
  await migrate(drizzle(database.client), { migrationsFolder: database.folder });
  return database;
}

describe("the stock count lots migration applied over a database that already holds a count", {
  timeout: 30_000,
}, () => {
  it("keeps the count, counted by product, with no lot recorded for it", async () => {
    const { client, movementId } = await migrated();

    const counts = await client.query("select movement_id, counted, expected from stock_counts");
    const countedLots = await client.query("select * from stock_count_lots");

    expect(counts.rows).toEqual([{ movement_id: movementId, counted: 1000, expected: 1000 }]);
    expect(countedLots.rows).toEqual([]);
  });

  it("records the quantity counted of a lot once per count, never below zero, and only of existing counts and lots", async () => {
    const { client, movementId, lotId } = await migrated();
    const record = (movement: string, lot: string, counted: number) =>
      client.query(
        "insert into stock_count_lots (movement_id, lot_id, counted) values ($1, $2, $3)",
        [movement, lot, counted],
      );

    await record(movementId, lotId, 0);

    await expect(record(movementId, lotId, 5)).rejects.toThrow(
      /stock_count_lots_movement_id_lot_id_pk/,
    );
    await client.query("delete from stock_count_lots");
    await expect(record(movementId, lotId, -1)).rejects.toThrow(
      /stock_count_lots_counted_non_negative/,
    );
    await expect(record(movementId, "0d9c4f6e-2b1a-4c3d-8e5f-6a7b8c9d0e1f", 1)).rejects.toThrow(
      /stock_count_lots_lot_id_lots_id_fk/,
    );
    await expect(record("0d9c4f6e-2b1a-4c3d-8e5f-6a7b8c9d0e1f", lotId, 1)).rejects.toThrow(
      /stock_count_lots_movement_id_stock_counts_movement_id_fk/,
    );
  });
});
