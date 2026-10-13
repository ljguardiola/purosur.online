import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

describe("the discounts migration applied to a database that already holds products", {
  timeout: 30_000,
}, () => {
  it("leaves existing products unchanged, with no discounts", async () => {
    const database = await databaseBeforeMigration("_discounts");

    const { rows: categoryRows } = await database.query<{ id: string }>(
      "insert into categories (name) values ($1) returning id",
      ["Almacén"],
    );
    const category = categoryRows[0];
    if (!category) {
      throw new Error("test setup: seeding the category returned no row");
    }
    const { rows: productRows } = await database.query<{ id: string }>(
      "insert into products (name, category_id, sale_unit) values ($1, $2, $3) returning id",
      ["Miel pura de abeja 1 kg", category.id, "UNIT"],
    );
    const seededProduct = productRows[0];
    if (!seededProduct) {
      throw new Error("test setup: seeding the product returned no row");
    }

    const migrated = await database.applyMigration();

    const { rows: products } = await migrated.query(
      `select id, name, category_id as "categoryId", sale_unit as "saleUnit", active
         from products where id = $1`,
      [seededProduct.id],
    );
    expect(products).toMatchObject([
      {
        id: seededProduct.id,
        name: "Miel pura de abeja 1 kg",
        categoryId: category.id,
        saleUnit: "UNIT",
        active: true,
      },
    ]);
    const { rows: discounts } = await migrated.query("select id from discounts");
    expect(discounts).toEqual([]);
  });
});
