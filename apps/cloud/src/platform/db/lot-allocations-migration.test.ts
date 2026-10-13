import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

async function databaseHoldingALot() {
  const client = await databaseBeforeMigration("_lot_allocations");
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
  return { client, productId, locationId, userId, lotId };
}

async function migrated() {
  const { client: database, ...ids } = await databaseHoldingALot();
  const client = await database.applyMigration();
  return { client, ...ids };
}

describe("the lot allocations migration applied over a database that already holds a lot", {
  timeout: 30_000,
}, () => {
  it("keeps the lot with its cost, as a purchased lot with nothing remaining", async () => {
    const { client, lotId } = await migrated();

    const { rows } = await client.query(
      `select id, technical, cost_incomplete, cost_total_cents, cost_quantity, remaining, purchased_on
       from lots`,
    );

    expect(rows).toEqual([
      {
        id: lotId,
        technical: false,
        cost_incomplete: false,
        cost_total_cents: 500,
        cost_quantity: 1000,
        remaining: 0,
        purchased_on: null,
      },
    ]);
  });

  function insertTechnicalLot(
    client: Awaited<ReturnType<typeof migrated>>["client"],
    ids: { productId: string; locationId: string },
    overrides: Partial<Record<string, unknown>> = {},
  ) {
    const columns = {
      technical: true,
      cost_incomplete: true,
      expires_on: null,
      purchased_on: null,
      ...overrides,
    };
    const names = Object.keys(columns);
    return client.query(
      `insert into lots (product_id, location_id, quantity_received, ${names.join(", ")})
       values ($1, $2, 0, ${names.map((_, index) => `$${index + 3}`).join(", ")})`,
      [ids.productId, ids.locationId, ...Object.values(columns)],
    );
  }

  it("holds one technical lot per product and branch, with no cost, expiry or purchase date", async () => {
    const { client, productId, locationId } = await migrated();

    await insertTechnicalLot(client, { productId, locationId });

    await expect(insertTechnicalLot(client, { productId, locationId })).rejects.toThrow(
      /lots_one_technical_per_product_branch/,
    );
    await expect(
      insertTechnicalLot(
        client,
        { productId, locationId },
        { expires_on: "2027-01-01", technical: true },
      ),
    ).rejects.toThrow(/lots_technical_has_no_expiry_or_purchase_date_check/);
  });

  it("refuses a lot whose technical flag disagrees with having no purchase line", async () => {
    const { client, productId, locationId } = await migrated();

    await expect(
      client.query(
        `insert into lots (product_id, location_id, quantity_received, technical, cost_incomplete)
         values ($1, $2, 0, false, true)`,
        [productId, locationId],
      ),
    ).rejects.toThrow(/lots_technical_iff_no_purchase_line_check/);
  });

  it("refuses a cost with only one of its two numbers, and a missing cost not marked incomplete", async () => {
    const { client, productId, locationId, lotId } = await migrated();

    await expect(
      client.query("update lots set cost_quantity = null where id = $1", [lotId]),
    ).rejects.toThrow(/lots_cost_pair_check/);
    await expect(
      client.query("update lots set cost_total_cents = null, cost_quantity = null where id = $1", [
        lotId,
      ]),
    ).rejects.toThrow(/lots_cost_known_or_incomplete_check/);
    await expect(
      insertTechnicalLot(client, { productId, locationId }, { cost_incomplete: false }),
    ).rejects.toThrow(/lots_cost_known_or_incomplete_check/);
  });

  it("records a lot's allocations once per movement, never of nothing, and only of existing movements and lots", async () => {
    const { client, productId, locationId, userId, lotId } = await migrated();
    const { rows } = await client.query<{ id: string }>(
      `insert into stock_movements (product_id, location_id, kind, reason, delta, occurred_at, actor_id)
       values ($1, $2, 'loss', 'spoiled', -100, now(), $3) returning id`,
      [productId, locationId, userId],
    );
    const movementId = rows[0]?.id as string;
    const allocate = (movement: string, lot: string, quantity: number) =>
      client.query(
        "insert into lot_allocations (movement_id, lot_id, quantity) values ($1, $2, $3)",
        [movement, lot, quantity],
      );

    await allocate(movementId, lotId, -100);

    await expect(allocate(movementId, lotId, -50)).rejects.toThrow(
      /lot_allocations_movement_id_lot_id_pk/,
    );
    await expect(allocate(movementId, "0d9c4f6e-2b1a-4c3d-8e5f-6a7b8c9d0e1f", -50)).rejects.toThrow(
      /lot_allocations_lot_id_lots_id_fk/,
    );
    await client.query("delete from lot_allocations");
    await expect(allocate(movementId, lotId, 0)).rejects.toThrow(/lot_allocations_quantity_check/);
  });
});
