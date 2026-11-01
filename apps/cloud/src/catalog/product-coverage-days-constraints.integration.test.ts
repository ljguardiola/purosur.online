import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { products } from "../platform/db/schema.js";
import { constraintViolatedBy } from "../test-support/constraint-violated-by.js";
import {
  openProductConstraintsDatabase,
  type ProductConstraintsDatabase,
} from "./test-support/product-constraints-database.js";

let database: ProductConstraintsDatabase;

beforeAll(async () => {
  database = await openProductConstraintsDatabase("product_coverage_days_constraints");
}, 60_000);

afterAll(async () => {
  await database.close();
});

describe("the products table's coverage days constraint on a real Postgres", () => {
  it.each([1, 15, 365])("accepts %j coverage days", async (coverageDays) => {
    await expect(
      database.db.insert(products).values({
        name: "Alpiste",
        categoryId: database.categoryId,
        saleUnit: "KG",
        coverageDays,
      }),
    ).resolves.toBeDefined();
  });

  it.each([0, -1, 366])("rejects %j coverage days", async (coverageDays) => {
    await expect(
      database.db.insert(products).values({
        name: "Alpiste",
        categoryId: database.categoryId,
        saleUnit: "KG",
        coverageDays,
      }),
    ).rejects.toSatisfy((error) =>
      constraintViolatedBy(error, "products_coverage_days_range_check"),
    );
  });

  it("gives a product inserted without coverage days 15", async () => {
    const [product] = await database.db
      .insert(products)
      .values({ name: "Alpiste", categoryId: database.categoryId, saleUnit: "KG" })
      .returning({ coverageDays: products.coverageDays });

    expect(product).toEqual({ coverageDays: 15 });
  });
});
