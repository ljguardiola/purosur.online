import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";
import { DrizzlePurchasingListReader } from "../../purchasing/drizzle-purchasing-list-reader.js";
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

async function databaseHoldingPurchases() {
  const database = await databaseBeforeMigration("_load_purchase_lines_by_packages");
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
  for (const [lineId, productId] of [
    [packagedLineId, yerbaId],
    [totalLineId, harinaId],
  ]) {
    await database.query(
      `insert into lots (product_id, location_id, purchase_line_id, purchased_on, cost_total_cents, cost_quantity, quantity_received, remaining)
       values ($1, $2, $3, '2026-10-01', 500, 1000, 1000, 1000)`,
      [productId, locationId, lineId],
    );
  }
  const roleId = await first(database, "insert into roles (name) values ('Compras') returning id");
  await database.query(
    `insert into role_permissions (role_id, permission_key)
     values ($1, 'manage_purchase_presentations'), ($1, 'record_purchases')`,
    [roleId],
  );
  return {
    database,
    locationId,
    purchaseId,
    yerbaId,
    packagedLineId,
    totalLineId,
    roleId,
  };
}

describe("the load purchase lines by packages migration", { timeout: 30_000 }, () => {
  it("keeps the packages and quantity per package of a line that was loaded by a packaging", async () => {
    const { database, locationId, packagedLineId, totalLineId } = await databaseHoldingPurchases();
    const migrated = await database.applyMigration();
    const db = drizzle(await migrated.applyEveryLaterMigration());

    const [purchase] = await new DrizzlePurchasingListReader(db).purchases(locationId);

    const line = (id: string) => purchase?.lines.find((candidate) => candidate.id === id);
    expect(line(packagedLineId)).toMatchObject({
      packages: 3,
      quantity: 36_000,
      quantityPerPackage: 12_000,
    });
    expect(line(totalLineId)).toMatchObject({
      packages: null,
      quantity: 2_500,
      quantityPerPackage: 1_000,
    });
  });

  it("removes only the grant to manage purchase packagings from the roles that held it", async () => {
    const { database, roleId } = await databaseHoldingPurchases();
    const migrated = await database.applyMigration();

    const { rows } = await migrated.query<{ permission_key: string }>(
      "select permission_key from role_permissions where role_id = $1",
      [roleId],
    );

    expect(rows).toEqual([{ permission_key: "record_purchases" }]);
  });

  it("accepts a line that states its packages without a packaging", async () => {
    const { database, purchaseId, yerbaId } = await databaseHoldingPurchases();
    const migrated = await database.applyMigration();

    const { rows } = await migrated.query<{ packages: number; packaging_id: string | null }>(
      `insert into purchase_lines (purchase_id, position, product_id, packages, quantity, cost_paid_cents, quantity_per_package)
       values ($1, 3, $2, 4, 24000, 5000, 6000) returning packages, packaging_id`,
      [purchaseId, yerbaId],
    );

    expect(rows).toEqual([{ packages: 4, packaging_id: null }]);
  });

  it("still refuses a line that names a packaging without stating its packages", async () => {
    const { database, purchaseId, yerbaId } = await databaseHoldingPurchases();
    const migrated = await database.applyMigration();
    const { rows } = await migrated.query<{ id: string }>(
      "select id from product_packagings limit 1",
    );

    await expect(
      migrated.query(
        `insert into purchase_lines (purchase_id, position, product_id, packaging_id, quantity, cost_paid_cents, quantity_per_package)
         values ($1, 3, $2, $3, 6000, 5000, 1000)`,
        [purchaseId, yerbaId, rows[0]?.id],
      ),
    ).rejects.toThrow(/purchase_lines_packaging_needs_packages_check/);
  });
});
