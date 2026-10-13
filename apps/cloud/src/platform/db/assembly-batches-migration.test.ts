import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

const MISSING_ID = "0d9c4f6e-2b1a-4c3d-8e5f-6a7b8c9d0e1f";

async function databaseHoldingLotsAndMovements() {
  const database = await databaseBeforeMigration("_assembly_batches");
  const first = async (sql: string, params: unknown[] = []) => {
    const { rows } = await database.query<{ id: string }>(sql, params);
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
    "insert into products (name, category_id, sale_unit) values ('Nueces', $1, 'KG') returning id",
    [categoryId],
  );
  const mixId = await first(
    "insert into products (name, category_id, sale_unit) values ('Mix', $1, 'KG') returning id",
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
     values (gen_random_uuid(), $1, $2, 'Nueces', 1, 2500, gen_random_uuid(), 0, 2500) returning id`,
    [saleId, productId],
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
  const movement = (kind: string, reason: string | null, lines: [string | null, string | null]) =>
    first(
      `insert into stock_movements (product_id, location_id, kind, reason, delta, occurred_at, actor_id, sale_line_id, purchase_line_id)
       values ($1, $2, $3, $4, 1000, now(), $5, $6, $7) returning id`,
      [productId, locationId, kind, reason, userId, ...lines],
    );
  await movement("loss", "broken_or_spilled", [null, null]);
  await movement("adjustment", "found", [null, null]);
  await movement("count", null, [null, null]);
  await movement("sale", null, [saleLineId, null]);
  await movement("receipt", null, [null, purchaseLineId]);
  const openingId = await movement("opening_count", null, [null, null]);
  await movement("opening_count_withdrawal", null, [null, null]);
  await database.query(
    `insert into lots (product_id, location_id, quantity_received, purchase_line_id, cost_total_cents, cost_quantity)
     values ($1, $2, 1000, $3, 500, 1000)`,
    [productId, locationId, purchaseLineId],
  );
  await database.query(
    `insert into lots (product_id, location_id, quantity_received, origin_movement_id, cost_incomplete)
     values ($1, $2, 1000, $3, true)`,
    [productId, locationId, openingId],
  );
  await database.query(
    `insert into lots (product_id, location_id, quantity_received, technical, cost_incomplete)
     values ($1, $2, 0, true, true)`,
    [productId, locationId],
  );
  return { database, first, productId, mixId, locationId, userId };
}

async function migrated() {
  const { database, ...ids } = await databaseHoldingLotsAndMovements();
  const client = await database.applyMigration();
  const batch = (output = 14_000) =>
    ids.first(
      `insert into assembly_batches (product_id, location_id, assembled_at, output_qty, actor_id)
       values ($1, $2, now(), $3, $4) returning id`,
      [ids.mixId, ids.locationId, output, ids.userId],
    );
  return { client, batch, ...ids };
}

describe("the assembly batches migration applied over a database that already holds lots and movements", {
  timeout: 30_000,
}, () => {
  it("keeps every movement of every existing kind, none of them tied to a batch", async () => {
    const { client } = await migrated();

    const { rows } = await client.query(
      "select kind, assembly_batch_id from stock_movements order by kind",
    );

    expect(rows).toEqual(
      [
        "adjustment",
        "count",
        "loss",
        "opening_count",
        "opening_count_withdrawal",
        "receipt",
        "sale",
      ].map((kind) => ({ kind, assembly_batch_id: null })),
    );
  });

  it("keeps the purchase lot, the initial-count lot and the technical lot, none of them from a batch", async () => {
    const { client } = await migrated();

    const { rows } = await client.query(
      `select technical, purchase_line_id is not null as purchased,
              origin_movement_id is not null as counted, assembly_batch_id
         from lots order by technical, purchased`,
    );

    expect(rows).toEqual([
      { technical: false, purchased: false, counted: true, assembly_batch_id: null },
      { technical: false, purchased: true, counted: false, assembly_batch_id: null },
      { technical: true, purchased: false, counted: false, assembly_batch_id: null },
    ]);
  });

  it("records a batch with the components it used, one line per component", async () => {
    const { client, batch, productId } = await migrated();
    const batchId = await batch();

    await client.query(
      `insert into assembly_batch_lines (batch_id, component_product_id, quantity) values ($1, $2, 12000)`,
      [batchId, productId],
    );

    const { rows } = await client.query(
      "select batch_id = $1 as ours, component_product_id, quantity from assembly_batch_lines",
      [batchId],
    );
    expect(rows).toEqual([{ ours: true, component_product_id: productId, quantity: 12_000 }]);
  });

  it("keeps a single line per component of a batch, of an existing batch and product, with a quantity that is not negative", async () => {
    const { client, batch, productId } = await migrated();
    const batchId = await batch();
    const line = (id: string, product: string, quantity: number) =>
      client.query(
        "insert into assembly_batch_lines (batch_id, component_product_id, quantity) values ($1, $2, $3)",
        [id, product, quantity],
      );

    await line(batchId, productId, 0);

    await expect(line(batchId, productId, 1_000)).rejects.toThrow(/assembly_batch_lines_pkey/);
    await expect(line(MISSING_ID, productId, 1_000)).rejects.toThrow(
      /assembly_batch_lines_batch_id_assembly_batches_id_fk/,
    );
    await expect(line(batchId, MISSING_ID, 1_000)).rejects.toThrow(
      /assembly_batch_lines_component_product_id_products_id_fk/,
    );
    await expect(line(await batch(), productId, -1)).rejects.toThrow(
      /assembly_batch_lines_quantity_check/,
    );
  });

  it("refuses a batch without an output, or of a product, a location or a person that do not exist", async () => {
    const { client, batch, mixId, locationId, userId } = await migrated();
    const record = (fields: { product?: string; location?: string; actor?: string }) =>
      client.query(
        `insert into assembly_batches (product_id, location_id, assembled_at, output_qty, actor_id)
         values ($1, $2, now(), 1000, $3)`,
        [fields.product ?? mixId, fields.location ?? locationId, fields.actor ?? userId],
      );

    await expect(batch(0)).rejects.toThrow(/assembly_batches_output_qty_check/);
    await expect(record({ product: MISSING_ID })).rejects.toThrow(
      /assembly_batches_product_id_products_id_fk/,
    );
    await expect(record({ location: MISSING_ID })).rejects.toThrow(
      /assembly_batches_location_id_locations_id_fk/,
    );
    await expect(record({ actor: MISSING_ID })).rejects.toThrow(
      /assembly_batches_actor_id_users_id_fk/,
    );
  });

  it("accepts the two movements of a batch only against one, with no reason", async () => {
    const { client, batch, mixId, locationId, userId } = await migrated();
    const batchId = await batch();
    const record = (kind: string, reason: string | null, linkedTo: string | null) =>
      client.query(
        `insert into stock_movements (product_id, location_id, kind, reason, delta, occurred_at, actor_id, assembly_batch_id)
         values ($1, $2, $3, $4, 1000, now(), $5, $6)`,
        [mixId, locationId, kind, reason, userId, linkedTo],
      );

    await record("assembly_out", null, batchId);
    await record("assembly_in", null, batchId);

    await expect(record("assembly_in", "found", batchId)).rejects.toThrow(
      /stock_movements_reason_unless_count_sale_or_receipt_check/,
    );
    await expect(record("assembly_out", null, null)).rejects.toThrow(
      /stock_movements_assembly_batch_iff_assembly_check/,
    );
    await expect(record("loss", "broken_or_spilled", batchId)).rejects.toThrow(
      /stock_movements_assembly_batch_iff_assembly_check/,
    );
    await expect(record("assembly_in", null, MISSING_ID)).rejects.toThrow(
      /stock_movements_assembly_batch_id_assembly_batches_id_fk/,
    );
    await expect(record("assembly", "found", null)).rejects.toThrow(/stock_movements_kind_check/);
  });

  it("keeps a lot of a batch to that batch alone as its origin, one lot per batch, with its cost pair", async () => {
    const { client, batch, mixId, locationId, productId } = await migrated();
    const batchId = await batch();
    const lot = (fields: {
      batchId: string | null;
      technical?: boolean;
      purchased?: boolean;
      total?: number | null;
    }) =>
      client.query(
        `insert into lots (product_id, location_id, quantity_received, technical, cost_incomplete, cost_total_cents, cost_quantity, assembly_batch_id)
         values ($1, $2, 14000, $3, $4, $5, $6, $7)`,
        [
          mixId,
          locationId,
          fields.technical ?? false,
          (fields.total ?? null) === null,
          fields.total ?? null,
          fields.total === undefined || fields.total === null ? null : 14_000,
          fields.batchId,
        ],
      );

    await lot({ batchId, total: 50_200 });

    await expect(lot({ batchId, total: 50_200 })).rejects.toThrow(/lots_assembly_batch_id_key/);
    await expect(lot({ batchId: MISSING_ID, total: 1 })).rejects.toThrow(
      /lots_assembly_batch_id_assembly_batches_id_fk/,
    );
    await expect(lot({ batchId: null, total: 1 })).rejects.toThrow(/lots_exactly_one_origin_check/);
    await expect(lot({ batchId: await batch(), technical: true, total: 1 })).rejects.toThrow(
      /lots_exactly_one_origin_check/,
    );
    await expect(
      client.query(
        `insert into lots (product_id, location_id, quantity_received, cost_incomplete, assembly_batch_id, purchase_line_id)
         values ($1, $2, 1000, true, $3, (select id from purchase_lines limit 1))`,
        [productId, locationId, await batch()],
      ),
    ).rejects.toThrow(/lots_exactly_one_origin_check/);
  });
});
