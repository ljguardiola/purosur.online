import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertProduct } from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleActiveProductLock } from "./drizzle-active-product-lock.js";

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

describe("DrizzleActiveProductLock.lockActiveProduct", () => {
  it.each([
    ["an active product", true, { kind: "locked" }],
    ["a deactivated product", false, { kind: "not_found" }],
  ])("locks a product only while it is active: %s", async (_case, active, expected) => {
    const { productId } = await insertProduct(db, { active });

    const locked = await db.transaction((tx) =>
      new DrizzleActiveProductLock(tx).lockActiveProduct(productId),
    );

    expect(locked).toEqual(expected);
  });
});
