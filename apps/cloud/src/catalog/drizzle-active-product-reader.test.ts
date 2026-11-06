import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertProduct } from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleActiveProductReader } from "./drizzle-active-product-reader.js";

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

describe("DrizzleActiveProductReader.isActiveProduct", () => {
  it("is true for an active product", async () => {
    const { productId } = await insertProduct(db);

    expect(await new DrizzleActiveProductReader(db).isActiveProduct(productId)).toBe(true);
  });

  it("is false for an inactive product and for one that does not exist", async () => {
    const { productId } = await insertProduct(db, { name: "Retirado", active: false });

    const reader = new DrizzleActiveProductReader(db);

    expect(await reader.isActiveProduct(productId)).toBe(false);
    expect(await reader.isActiveProduct("00000000-0000-4000-8000-000000000000")).toBe(false);
  });
});
