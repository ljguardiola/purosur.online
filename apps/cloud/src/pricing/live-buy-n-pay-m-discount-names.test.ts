import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { discounts } from "../platform/db/schema.js";
import { insertProduct } from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { liveBuyNPayMDiscountNamesOn } from "./live-buy-n-pay-m-discount-names.js";

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

async function discountOn(
  productId: string,
  overrides: Partial<typeof discounts.$inferInsert> = {},
): Promise<void> {
  await db.insert(discounts).values({
    name: "3x2 Arroz",
    kind: "BUY_N_PAY_M",
    buyQty: 3,
    payQty: 2,
    productId,
    validFrom: "2026-06-01",
    validTo: "2026-06-15",
    ...overrides,
  });
}

function namesOn(productId: string, today: string): Promise<string[]> {
  return db.transaction((tx) => liveBuyNPayMDiscountNamesOn(tx, productId, today));
}

describe("liveBuyNPayMDiscountNamesOn", () => {
  it.each([
    ["current", "2026-06-10"],
    ["on its last day", "2026-06-15"],
    ["scheduled", "2026-05-20"],
  ])("names a buy-n-pay-m discount on the product that is %s", async (_case, today) => {
    const { productId } = await insertProduct(db);
    await discountOn(productId);

    expect(await namesOn(productId, today)).toEqual(["3x2 Arroz"]);
  });

  it.each([
    ["ended", {}, "2026-06-16"],
    ["switched off", { active: false }, "2026-06-10"],
    [
      "a percentage off",
      { kind: "PERCENT_OFF" as const, percent: 10, buyQty: null, payQty: null },
      "2026-06-10",
    ],
  ])("leaves out a discount that is %s", async (_case, overrides, today) => {
    const { productId } = await insertProduct(db);
    await discountOn(productId, overrides);

    expect(await namesOn(productId, today)).toEqual([]);
  });

  it("leaves out a live discount on another product", async () => {
    const { productId } = await insertProduct(db, { name: "Arroz" });
    const other = await insertProduct(db, { name: "Fideos" });
    await discountOn(other.productId);

    expect(await namesOn(productId, "2026-06-10")).toEqual([]);
  });

  it("names every live discount on the product", async () => {
    const { productId } = await insertProduct(db);
    await discountOn(productId, { name: "3x2 Arroz" });
    await discountOn(productId, { name: "2x1 Arroz" });

    expect((await namesOn(productId, "2026-06-10")).sort()).toEqual(["2x1 Arroz", "3x2 Arroz"]);
  });
});
