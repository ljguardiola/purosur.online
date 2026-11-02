import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

type Database = Awaited<ReturnType<typeof databaseBeforeMigration>>;

async function first(database: Database, sql: string, params: unknown[] = []): Promise<string> {
  const { rows } = await database.query<{ id: string }>(sql, params);
  const id = rows[0]?.id;
  if (!id) {
    throw new Error("test setup: the insert returned no row");
  }
  return id;
}

async function databaseHoldingPackagings() {
  const database = await databaseBeforeMigration("_drop_purchase_packagings_links");
  const locationId = await first(database, "select id from locations limit 1");
  const userId = await first(
    database,
    `insert into users (first_name, email, location_id)
     values ('Ada', 'ada@example.com', $1) returning id`,
    [locationId],
  );
  const categoryId = await first(
    database,
    "insert into categories (name) values ('Almacén') returning id",
  );
  const supplierId = await first(
    database,
    "insert into suppliers (name, actor_id) values ('Distribuidora Ejemplo', $1) returning id",
    [userId],
  );
  const yerbaId = await first(
    database,
    "insert into products (name, category_id, sale_unit) values ('Yerba', $1, 'UNIT') returning id",
    [categoryId],
  );
  const harinaId = await first(
    database,
    "insert into products (name, category_id, sale_unit) values ('Harina', $1, 'KG') returning id",
    [categoryId],
  );
  const packagingId = await first(
    database,
    `insert into product_packagings (product_id, name, quantity_per_package, sale_unit, actor_id)
     values ($1, 'Caja x 12', 12000, 'UNIT', $2) returning id`,
    [yerbaId, userId],
  );
  const purchaseId = await first(
    database,
    `insert into purchases (supplier_id, location_id, purchased_on, receipt_type, receipt_number, recorded_at, actor_id)
     values ($1, $2, '2026-10-01', 'factura_b', '0001-00000042', '2026-10-02T12:00:00Z', $3) returning id`,
    [supplierId, locationId, userId],
  );
  const packagedLineId = await first(
    database,
    `insert into purchase_lines (purchase_id, position, product_id, packaging_id, packages, quantity, cost_paid_cents, quantity_per_package)
     values ($1, 1, $2, $3, 3, 36000, 36000, 12000) returning id`,
    [purchaseId, yerbaId, packagingId],
  );
  const totalLineId = await first(
    database,
    `insert into purchase_lines (purchase_id, position, product_id, quantity, cost_paid_cents, quantity_per_package)
     values ($1, 2, $2, 2500, 1000, 1000) returning id`,
    [purchaseId, harinaId],
  );
  const roleId = await first(database, "insert into roles (name) values ('Compras') returning id");
  await database.query(
    `insert into role_permissions (role_id, permission_key)
     values ($1, 'manage_purchase_presentations'), ($1, 'record_purchases')`,
    [roleId],
  );
  const listId = await first(
    database,
    `insert into supplier_price_lists
       (supplier_id, location_id, source_kind, file_name, file_content_kind, file_byte_size, state, uploaded_at, uploaded_by)
     values ($1, $2, 'PDF', 'lista.pdf', 'PDF', 1000, 'EXTRACTED', '2026-03-01T12:00:00Z', $3) returning id`,
    [supplierId, locationId, userId],
  );
  const rowId = await first(
    database,
    `insert into supplier_price_list_rows (list_id, position, description, price_cents, product_id, packaging_id, vat_rate)
     values ($1, 0, 'Yerba', 6000, $2, $3, 2100) returning id`,
    [listId, yerbaId, packagingId],
  );
  const itemId = await first(
    database,
    `insert into supplier_items (supplier_id, key_kind, key_value, description, product_id, packaging_id, vat_rate)
     values ($1, 'description', 'Yerba', 'Yerba', $2, $3, 2100) returning id`,
    [supplierId, yerbaId, packagingId],
  );
  return {
    database,
    purchaseId,
    yerbaId,
    packagedLineId,
    totalLineId,
    roleId,
    listId,
    rowId,
    itemId,
    supplierId,
  };
}

describe("the drop purchase packagings links migration", { timeout: 30_000 }, () => {
  it("keeps the packages, quantity and quantity per package of the lines that were loaded by a packaging", async () => {
    const { database, packagedLineId, totalLineId } = await databaseHoldingPackagings();
    const migrated = await database.applyMigration();

    const { rows } = await migrated.query(
      `select id, packages, quantity, quantity_per_package from purchase_lines
       where id in ($1, $2) order by position`,
      [packagedLineId, totalLineId],
    );

    expect(rows).toEqual([
      { id: packagedLineId, packages: 3, quantity: 36_000, quantity_per_package: 12_000 },
      { id: totalLineId, packages: null, quantity: 2_500, quantity_per_package: 1_000 },
    ]);
  });

  it("removes only the grant to manage purchase packagings from the roles that held it", async () => {
    const { database, roleId } = await databaseHoldingPackagings();
    const migrated = await database.applyMigration();

    const { rows } = await migrated.query<{ permission_key: string }>(
      "select permission_key from role_permissions where role_id = $1",
      [roleId],
    );

    expect(rows).toEqual([{ permission_key: "record_purchases" }]);
  });

  it("stops deriving the quantity of a supplier item and of a price list row from a packaging", async () => {
    const { database } = await databaseHoldingPackagings();
    const migrated = await database.applyMigration();

    const { rows } = await migrated.query<{ tgname: string }>(
      "select tgname from pg_trigger where tgname like '%link_quantity_from_packaging'",
    );

    expect(rows).toEqual([]);
  });

  it("accepts a line that names a packaging without stating its packages", async () => {
    const { database, purchaseId, yerbaId } = await databaseHoldingPackagings();
    const migrated = await database.applyMigration();
    const { rows } = await migrated.query<{ id: string }>(
      "select id from product_packagings limit 1",
    );

    const inserted = await migrated.query(
      `insert into purchase_lines (purchase_id, position, product_id, packaging_id, quantity, cost_paid_cents, quantity_per_package)
       values ($1, 3, $2, $3, 6000, 5000, 1000) returning packaging_id`,
      [purchaseId, yerbaId, rows[0]?.id],
    );

    expect(inserted.rows).toHaveLength(1);
  });

  it("accepts a packaging id that points at no packaging", async () => {
    const { database, listId, supplierId } = await databaseHoldingPackagings();
    const migrated = await database.applyMigration();
    const missing = randomUUID();

    const row = await migrated.query(
      `insert into supplier_price_list_rows (list_id, position, description, price_cents, packaging_id, vat_rate)
       values ($1, 5, 'Sin vincular', 100, $2, 2100) returning id`,
      [listId, missing],
    );
    const item = await migrated.query(
      `insert into supplier_items (supplier_id, key_kind, key_value, description, packaging_id, vat_rate)
       values ($1, 'description', 'Sin vincular', 'Sin vincular', $2, 2100) returning id`,
      [supplierId, missing],
    );

    expect([row.rows.length, item.rows.length]).toEqual([1, 1]);
  });
});
