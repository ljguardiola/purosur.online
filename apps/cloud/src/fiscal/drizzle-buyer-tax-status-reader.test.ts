import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buyerTaxStatusSets } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleBuyerTaxStatusReader } from "./drizzle-buyer-tax-status-reader.js";

const a = { code: 901, description: "Condicion de prueba A", invoiceClass: "A" };
const b = { code: 902, description: "Condicion de prueba B", invoiceClass: "C" };

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

describe("DrizzleBuyerTaxStatusReader", () => {
  it("answers no set while none was recorded", async () => {
    expect(await new DrizzleBuyerTaxStatusReader(db).latestBuyerTaxStatusSet()).toBeUndefined();
  });

  it("answers the set with the highest version, whatever order they were recorded in", async () => {
    await db.insert(buyerTaxStatusSets).values({ paramsVersion: 2, options: [a, b] });
    await db.insert(buyerTaxStatusSets).values({ paramsVersion: 1, options: [a] });

    expect(await new DrizzleBuyerTaxStatusReader(db).latestBuyerTaxStatusSet()).toEqual({
      paramsVersion: 2,
      options: [a, b],
    });
  });
});
