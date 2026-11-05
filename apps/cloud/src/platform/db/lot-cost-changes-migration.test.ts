import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

const MISSING_ID = "0d9c4f6e-2b1a-4c3d-8e5f-6a7b8c9d0e1f";

async function databaseHoldingAPurchasedLot() {
  const database = await databaseBeforeMigration("_lot_cost_changes");
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
     values ($1, 1, $2, 1000, 500, 1000) returning id`,
    [purchaseId, productId],
  );
  const lotId = await first(
    `insert into lots (product_id, location_id, purchase_line_id, cost_total_cents, cost_quantity, quantity_received)
     values ($1, $2, $3, 500, 1000, 1000) returning id`,
    [productId, locationId, purchaseLineId],
  );
  return { database, lotId };
}

async function migrated() {
  const { database, lotId } = await databaseHoldingAPurchasedLot();
  return { client: await database.applyMigration(), lotId };
}

describe("the lot cost changes migration applied over a database that already holds a lot", {
  timeout: 30_000,
}, () => {
  it("keeps the lot with its cost and records no change of it", async () => {
    const { client, lotId } = await migrated();

    const lots = await client.query("select id, cost_total_cents, cost_quantity from lots");
    const changes = await client.query("select * from lot_cost_changes");

    expect(lots.rows).toEqual([{ id: lotId, cost_total_cents: 500, cost_quantity: 1000 }]);
    expect(changes.rows).toEqual([]);
  });

  it("records the cost a lot had before each of its changes, any number of times", async () => {
    const { client, lotId } = await migrated();
    const record = (changedAt: string, total: number, quantity: number) =>
      client.query(
        `insert into lot_cost_changes (lot_id, changed_at, previous_cost_total_cents, previous_cost_quantity)
         values ($1, $2, $3, $4)`,
        [lotId, changedAt, total, quantity],
      );

    await record("2026-10-02T10:00:00Z", 500, 1000);
    await record("2026-10-03T10:00:00Z", 700, 1000);

    const { rows } = await client.query(
      "select lot_id, previous_cost_total_cents, previous_cost_quantity from lot_cost_changes order by changed_at",
    );
    expect(rows).toEqual([
      { lot_id: lotId, previous_cost_total_cents: 500, previous_cost_quantity: 1000 },
      { lot_id: lotId, previous_cost_total_cents: 700, previous_cost_quantity: 1000 },
    ]);
  });

  it("records a change only of an existing lot and only over a positive cost quantity", async () => {
    const { client, lotId } = await migrated();
    const record = (lot: string, quantity: number) =>
      client.query(
        `insert into lot_cost_changes (lot_id, changed_at, previous_cost_total_cents, previous_cost_quantity)
         values ($1, now(), 500, $2)`,
        [lot, quantity],
      );

    await expect(record(MISSING_ID, 1000)).rejects.toThrow(/lot_cost_changes_lot_id_lots_id_fk/);
    await expect(record(lotId, 0)).rejects.toThrow(/lot_cost_changes_previous_cost_quantity_check/);
  });
});
