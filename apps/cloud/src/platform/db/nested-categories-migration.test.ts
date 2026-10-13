import { describe, expect, it } from "vitest";
import {
  databaseBeforeMigration,
  type SqlOnlyDatabase,
} from "./test-support/migration-under-test.js";

interface SeededCategory {
  id: string;
  name: string;
}

async function insertPreMigrationCategory(
  client: SqlOnlyDatabase,
  name: string,
  version = 1,
): Promise<SeededCategory> {
  const { rows } = await client.query<SeededCategory>(
    "insert into categories (name, version) values ($1, $2) returning id, name",
    [name, version],
  );
  const category = rows[0];
  if (!category) {
    throw new Error("test setup: seeding a category returned no row");
  }
  return category;
}

async function insertPreMigrationProduct(
  client: SqlOnlyDatabase,
  categoryId: string,
  name: string,
  active: boolean,
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `insert into products (name, category_id, sale_unit, active)
     values ($1, $2, 'UNIT', $3)
     returning id`,
    [name, categoryId, active],
  );
  const product = rows[0];
  if (!product) {
    throw new Error("test setup: seeding a product returned no row");
  }
  return product.id;
}

describe("the nested_categories migration's effect on existing categories and products", {
  timeout: 30_000,
}, () => {
  it(
    "keeps every existing category top-level, keeps its products, and enforces the new " +
      "parent-scoped name uniqueness on the migrated data",
    async () => {
      const database = await databaseBeforeMigration("_nested_categories");

      // Names must be distinct: the pre-migration, table-wide `categories_name_lower_key` already
      // forbids a case-variant duplicate here, same as the parent-scoped index will after migrating.
      const bebidas = await insertPreMigrationCategory(database, "Bebidas");
      const lacteos = await insertPreMigrationCategory(database, "Lácteos", 3);
      const limpieza = await insertPreMigrationCategory(database, "Limpieza");

      const activeProductId = await insertPreMigrationProduct(
        database,
        bebidas.id,
        "Agua 1.5L",
        true,
      );
      const inactiveProductId = await insertPreMigrationProduct(
        database,
        lacteos.id,
        "Leche descremada 1L",
        false,
      );

      const migrated = await database.applyMigration();
      const migratedCategories = (
        await migrated.query<{
          id: string;
          name: string;
          version: number;
          parentId: string | null;
        }>(`select id, name, version, parent_id as "parentId" from categories`)
      ).rows.sort((a, b) => a.name.localeCompare(b.name, "es"));

      expect(migratedCategories).toEqual([
        { id: bebidas.id, name: "Bebidas", version: 1, parentId: null },
        { id: lacteos.id, name: "Lácteos", version: 3, parentId: null },
        { id: limpieza.id, name: "Limpieza", version: 1, parentId: null },
      ]);

      const { rows: migratedProducts } = await migrated.query(
        `select id, category_id as "categoryId", active from products order by name asc`,
      );
      expect(migratedProducts).toEqual([
        { id: activeProductId, categoryId: bebidas.id, active: true },
        { id: inactiveProductId, categoryId: lacteos.id, active: false },
      ]);

      await expect(
        migrated.query("insert into categories (name) values ($1)", ["BEBIDAS"]),
      ).rejects.toMatchObject({ code: "23505", constraint: "categories_name_lower_key" });
    },
  );
});
