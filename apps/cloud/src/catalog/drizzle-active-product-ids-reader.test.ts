import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertProduct } from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleActiveProductIdsReader } from "./drizzle-active-product-ids-reader.js";

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

describe("DrizzleActiveProductIdsReader.activeProductIds", () => {
  it("answers which of the asked products are active, leaving out a deactivated one and one not asked", async () => {
    const { productId: active } = await insertProduct(db, { name: "Torta" });
    const { productId: deactivated } = await insertProduct(db, { name: "Retirado", active: false });
    await insertProduct(db, { name: "Harina" });

    const found = await new DrizzleActiveProductIdsReader(db).activeProductIds([
      active,
      deactivated,
    ]);

    expect(found).toEqual([active]);
  });
});
