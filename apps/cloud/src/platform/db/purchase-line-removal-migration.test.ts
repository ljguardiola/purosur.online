import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

async function databaseHoldingPurchasedLots() {
  const database = await databaseBeforeMigration("_purchase_line_removal");
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
     values ($1, 1, $2, 2000, 500, 1000) returning id`,
    [purchaseId, productId],
  );
  const lotId = await first(
    `insert into lots (product_id, location_id, purchase_line_id, cost_total_cents, cost_quantity, quantity_received, remaining)
     values ($1, $2, $3, 500, 1000, 2000, 2000) returning id`,
    [productId, locationId, purchaseLineId],
  );
  return { database, productId, locationId, purchaseLineId, lotId };
}

async function migrated() {
  const { database, ...ids } = await databaseHoldingPurchasedLots();
  const client = await database.applyMigration();
  return { client, ...ids };
}

describe("the purchase line removal migration applied over a database that already holds purchased lots", {
  timeout: 30_000,
}, () => {
  it("keeps every purchase line as it was, not removed", async () => {
    const { client, purchaseLineId } = await migrated();

    const { rows } = await client.query("select id, removed_at from purchase_lines");

    expect(rows).toEqual([{ id: purchaseLineId, removed_at: null }]);
  });

  it("keeps every purchased lot with its units, not withdrawn", async () => {
    const { client, lotId } = await migrated();

    const { rows } = await client.query("select id, remaining, withdrawn from lots");

    expect(rows).toEqual([{ id: lotId, remaining: 2000, withdrawn: false }]);
  });

  it("records when a purchase line was removed", async () => {
    const { client, purchaseLineId } = await migrated();

    await client.query(
      "update purchase_lines set removed_at = '2026-11-05T12:00:00Z' where id = $1",
      [purchaseLineId],
    );

    const { rows } = await client.query<{ removed_at: Date }>(
      "select removed_at from purchase_lines",
    );
    expect(rows[0]?.removed_at.toISOString()).toBe("2026-11-05T12:00:00.000Z");
  });

  it("accepts a withdrawn purchased lot and still refuses a withdrawn technical lot", async () => {
    const { client, productId, locationId, lotId } = await migrated();

    await client.query("update lots set withdrawn = true where id = $1", [lotId]);

    await expect(
      client.query(
        `insert into lots (product_id, location_id, technical, cost_incomplete, quantity_received, withdrawn)
         values ($1, $2, true, true, 0, true)`,
        [productId, locationId],
      ),
    ).rejects.toThrow(/lots_withdrawn_only_if_purchased_or_initial_count_check/);
  });

  it("allows a new own lot for a purchase line once its own lot is withdrawn, and only then", async () => {
    const { client, productId, locationId, purchaseLineId, lotId } = await migrated();
    const insertOwnLot = () =>
      client.query(
        `insert into lots (product_id, location_id, purchase_line_id, cost_total_cents, cost_quantity, quantity_received, remaining)
         values ($1, $2, $3, 500, 1000, 2000, 0)`,
        [productId, locationId, purchaseLineId],
      );

    await expect(insertOwnLot()).rejects.toThrow(/lots_one_own_lot_per_purchase_line/);
    await client.query("update lots set withdrawn = true where id = $1", [lotId]);
    await insertOwnLot();

    await expect(insertOwnLot()).rejects.toThrow(/lots_one_own_lot_per_purchase_line/);
  });
});
