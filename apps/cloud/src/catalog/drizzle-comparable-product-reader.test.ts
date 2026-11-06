import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { categories } from "../platform/db/schema.js";
import { insertProduct } from "../purchasing/test-support/purchasing-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleComparableProductReader } from "./drizzle-comparable-product-reader.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];

const reader = () => new DrizzleComparableProductReader(db);

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

describe("the products to compare", () => {
  it("answers the active products with their category and sale unit", async () => {
    const { id } = await insertProduct(db, { name: "Harina", saleUnit: "KG" });
    await insertProduct(db, { name: "Retirado", active: false });
    const [category] = await db.select({ name: categories.name }).from(categories);

    expect(await reader().activeProducts()).toEqual([
      {
        id,
        name: "Harina",
        brandName: null,
        netContent: null,
        categoryName: category?.name,
        saleUnit: "KG",
      },
    ]);
  });

  it("answers each active product's brand name and net content", async () => {
    const { id } = await insertProduct(db, {
      name: "Aceite de Almendras",
      brandName: "Vitora",
      netContent: { quantity: 30, unit: "ML" },
    });

    expect(await reader().activeProducts()).toMatchObject([
      { id, brandName: "Vitora", netContent: { quantity: 30, unit: "ML" } },
    ]);
  });
});
