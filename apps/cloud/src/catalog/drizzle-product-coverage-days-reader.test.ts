import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setCoverageDays } from "../purchasing/test-support/order-suggestion-fixtures.js";
import { insertProduct } from "../purchasing/test-support/purchasing-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleProductCoverageDaysReader } from "./drizzle-product-coverage-days-reader.js";

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

describe("the coverage days", () => {
  it("answers those of each active product, 15 when never configured", async () => {
    const configured = await insertProduct(db, { name: "Yerba" });
    const standard = await insertProduct(db, { name: "Harina" });
    await insertProduct(db, { name: "Retirado", active: false });
    await setCoverageDays(db, configured.id, 40);

    const coverage = await new DrizzleProductCoverageDaysReader(db).coverageDays();

    expect(coverage).toHaveLength(2);
    expect(coverage).toEqual(
      expect.arrayContaining([
        { productId: configured.id, coverageDays: 40 },
        { productId: standard.id, coverageDays: 15 },
      ]),
    );
  });
});
