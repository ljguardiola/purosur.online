import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertProduct } from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzlePriceReviewProductReader } from "./drizzle-price-review-product-reader.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];

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

describe("DrizzlePriceReviewProductReader.activeProducts", () => {
  it("answers each active product with its catalog fields and leaves out a deactivated one", async () => {
    const { productId, categoryId } = await insertProduct(db, {
      name: "Aceite de Almendras",
      categoryName: "Cosmética",
      saleUnit: "UNIT",
      brandName: "Vitora",
      netContent: { quantity: 30, unit: "ML" },
    });
    await insertProduct(db, { name: "Retirado", active: false });

    expect(await new DrizzlePriceReviewProductReader(db).activeProducts()).toEqual([
      {
        id: productId,
        name: "Aceite de Almendras",
        categoryId,
        categoryName: "Cosmética",
        brandName: "Vitora",
        netContent: { quantity: 30, unit: "ML" },
        saleUnit: "UNIT",
      },
    ]);
  });
});
