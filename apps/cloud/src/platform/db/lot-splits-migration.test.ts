import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

const KINDS_BEFORE_THE_MIGRATION = [
  "loss",
  "adjustment",
  "count",
  "sale",
  "sale_void",
  "return",
  "exchange_out",
  "receipt",
  "opening_count",
  "opening_count_withdrawal",
  "assembly_out",
  "assembly_in",
  "assembly_void",
];

async function databaseHoldingLotsAndMovementsOfEveryKind() {
  const database = await databaseBeforeMigration("_lot_splits");
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
  const purchaseLine = (position: number) =>
    first(
      `insert into purchase_lines (purchase_id, position, product_id, quantity, cost_paid_cents, quantity_per_package)
       values ($1, $2, $3, 2000, 500, 1000) returning id`,
      [purchaseId, position, productId],
    );
  const purchaseLineIds = [await purchaseLine(1), await purchaseLine(2)];
  const lotIds: string[] = [];
  for (const purchaseLineId of purchaseLineIds) {
    lotIds.push(
      await first(
        `insert into lots (product_id, location_id, purchase_line_id, expires_on, cost_total_cents, cost_quantity, quantity_received, remaining)
         values ($1, $2, $3, '2026-11-10', 500, 1000, 2000, 2000) returning id`,
        [productId, locationId, purchaseLineId],
      ),
    );
  }
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
  const batchId = await first(
    `insert into assembly_batches (product_id, location_id, assembled_at, output_qty, actor_id)
     values ($1, $2, now(), 1000, $3) returning id`,
    [productId, locationId, userId],
  );
  const links: Record<string, { reason?: string; column?: string; value?: string }> = {
    loss: { reason: "spoiled" },
    adjustment: { reason: "found" },
    sale: { column: "sale_line_id", value: saleLineId },
    sale_void: { column: "sale_line_id", value: saleLineId },
    return: { column: "sale_line_id", value: saleLineId },
    exchange_out: { column: "sale_line_id", value: saleLineId },
    receipt: { column: "purchase_line_id", value: purchaseLineIds[0] as string },
    assembly_out: { column: "assembly_batch_id", value: batchId },
    assembly_in: { column: "assembly_batch_id", value: batchId },
    assembly_void: { column: "assembly_batch_id", value: batchId },
  };
  for (const kind of KINDS_BEFORE_THE_MIGRATION) {
    const { reason = null, column, value } = links[kind] ?? {};
    await database.query(
      `insert into stock_movements (product_id, location_id, kind, reason, delta, occurred_at, actor_id${column ? `, ${column}` : ""})
       values ($1, $2, $3, $4, 1000, now(), $5${column ? ", $6" : ""})`,
      [productId, locationId, kind, reason, userId, ...(value ? [value] : [])],
    );
  }
  return { database, productId, locationId, purchaseLineIds, lotIds };
}

async function migrated() {
  const { database, ...ids } = await databaseHoldingLotsAndMovementsOfEveryKind();
  const client = await database.applyMigration();
  return { client, ...ids };
}

describe("the lot splits migration applied over a database that already holds lots and stock movements", {
  timeout: 30_000,
}, () => {
  it("keeps every purchased lot as its line's own lot, split from none", async () => {
    const { client, purchaseLineIds, lotIds } = await migrated();

    const { rows } = await client.query(
      "select id, purchase_line_id, split_from_lot_id, remaining from lots",
    );

    expect(rows).toEqual(
      expect.arrayContaining(
        lotIds.map((id, index) => ({
          id,
          purchase_line_id: purchaseLineIds[index],
          split_from_lot_id: null,
          remaining: 2000,
        })),
      ),
    );
    expect(rows).toHaveLength(2);
  });

  it("keeps every stock movement of every kind there was", async () => {
    const { client } = await migrated();

    const { rows } = await client.query<{ kind: string }>("select kind from stock_movements");

    expect(rows.map(({ kind }) => kind).sort()).toEqual([...KINDS_BEFORE_THE_MIGRATION].sort());
  });

  it("still refuses a second own lot of a purchase line and accepts a lot split from it", async () => {
    const { client, productId, locationId, purchaseLineIds, lotIds } = await migrated();
    const insertLot = (splitFromLotId: string | null) =>
      client.query(
        `insert into lots (product_id, location_id, purchase_line_id, split_from_lot_id, expires_on, cost_total_cents, cost_quantity, quantity_received, remaining)
         values ($1, $2, $3, $4, '2027-01-15', 500, 1000, 1000, 1000)`,
        [productId, locationId, purchaseLineIds[0], splitFromLotId],
      );

    await expect(insertLot(null)).rejects.toThrow(/lots_one_own_lot_per_purchase_line/);
    await insertLot(lotIds[0] as string);

    const { rows } = await client.query(
      "select split_from_lot_id from lots where split_from_lot_id is not null",
    );
    expect(rows).toEqual([{ split_from_lot_id: lotIds[0] }]);
  });

  it("accepts the movement of a lot split, with no reason", async () => {
    const { client, productId, locationId } = await migrated();
    const { rows: users } = await client.query<{ id: string }>("select id from users limit 1");
    const record = (reason: string | null) =>
      client.query(
        `insert into stock_movements (product_id, location_id, kind, reason, delta, occurred_at, actor_id)
         values ($1, $2, 'lot_split', $3, 0, now(), $4)`,
        [productId, locationId, reason, users[0]?.id],
      );

    await record(null);

    await expect(record("spoiled")).rejects.toThrow(
      /stock_movements_reason_unless_count_sale_or_receipt_check/,
    );
  });
});
