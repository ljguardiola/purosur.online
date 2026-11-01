import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

describe("the product_coverage_days migration applied to a database that already holds products", {
  timeout: 30_000,
}, () => {
  it("gives every existing product 15 coverage days and keeps the rest of its data", async () => {
    const database = await databaseBeforeMigration("_product_coverage_days");

    const { rows: categoryRows } = await database.query<{ id: string }>(
      "insert into categories (name) values ($1) returning id",
      ["Macetas"],
    );
    const category = categoryRows[0];
    if (!category) {
      throw new Error("test setup: seeding the category returned no row");
    }
    const { rows: productRows } = await database.query<{ id: string }>(
      "insert into products (name, category_id, sale_unit) values ($1, $2, $3), ($4, $2, $3) returning id",
      ["Maceta 20cm", category.id, "UNIT", "Maceta 30cm"],
    );
    expect(productRows).toHaveLength(2);

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query(
      "select name, sale_unit, active, version, coverage_days from products order by name",
    );
    expect(rows).toEqual([
      { name: "Maceta 20cm", sale_unit: "UNIT", active: true, version: 1, coverage_days: 15 },
      { name: "Maceta 30cm", sale_unit: "UNIT", active: true, version: 1, coverage_days: 15 },
    ]);
  });
});
