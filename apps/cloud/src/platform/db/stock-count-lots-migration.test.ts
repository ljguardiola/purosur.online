import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

async function databaseHoldingACount() {
  const database = await databaseBeforeMigration("_stock_count_lots");
  const first = async (sql: string, params: unknown[] = []) => {
    const { rows } = await database.query<{ id: string }>(sql, params);
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
  await database.query(
    "insert into stock_counts (movement_id, counted, expected) values ($1, 1000, 1000)",
    [movementId],
  );
  const lotId = await first(
    `insert into lots (product_id, location_id, quantity_received, technical, cost_incomplete)
     values ($1, $2, 0, true, true) returning id`,
    [productId, locationId],
  );
  return { database, movementId, lotId };
}

async function databaseAfterMigration() {
  const { database, movementId, lotId } = await databaseHoldingACount();
  const migrated = await database.applyMigration();
  return { migrated, movementId, lotId };
}

describe("the stock count lots migration applied over a database that already holds a count", {
  timeout: 30_000,
}, () => {
  it("keeps the count, counted by product, with no lot recorded for it", async () => {
    const { migrated, movementId } = await databaseAfterMigration();

    const counts = await migrated.query("select movement_id, counted, expected from stock_counts");
    const countedLots = await migrated.query("select * from stock_count_lots");

    expect(counts.rows).toEqual([{ movement_id: movementId, counted: 1000, expected: 1000 }]);
    expect(countedLots.rows).toEqual([]);
  });

  it("records the quantity counted of a lot once per count, never below zero, and only of existing counts and lots", async () => {
    const { migrated, movementId, lotId } = await databaseAfterMigration();
    const record = (movement: string, lot: string, counted: number) =>
      migrated.query(
        "insert into stock_count_lots (movement_id, lot_id, counted) values ($1, $2, $3)",
        [movement, lot, counted],
      );

    await record(movementId, lotId, 0);

    await expect(record(movementId, lotId, 5)).rejects.toThrow(
      /stock_count_lots_movement_id_lot_id_pk/,
    );
    await migrated.query("delete from stock_count_lots");
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
