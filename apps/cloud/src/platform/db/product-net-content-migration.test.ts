import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

describe("the product_net_content migration applied to a database that already holds products", {
  timeout: 30_000,
}, () => {
  it("leaves existing products unchanged, with no net content", async () => {
    const database = await databaseBeforeMigration("_product_net_content");

    const { rows: categoryRows } = await database.query<{ id: string }>(
      "insert into categories (name) values ($1) returning id",
      ["Macetas"],
    );
    const category = categoryRows[0];
    if (!category) {
      throw new Error("test setup: seeding the category returned no row");
    }
    const { rows: productRows } = await database.query<{ id: string }>(
      "insert into products (name, category_id, sale_unit) values ($1, $2, $3) returning id",
      ["Maceta 20cm", category.id, "UNIT"],
    );
    const seededProduct = productRows[0];
    if (!seededProduct) {
      throw new Error("test setup: seeding the product returned no row");
    }

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query(
      `select id, name, category_id, sale_unit, active, net_content_quantity::text, net_content_unit
       from products where id = $1`,
      [seededProduct.id],
    );

    expect(rows).toMatchObject([
      {
        id: seededProduct.id,
        name: "Maceta 20cm",
        category_id: category.id,
        sale_unit: "UNIT",
        active: true,
        net_content_quantity: null,
        net_content_unit: null,
      },
    ]);
  });
});
