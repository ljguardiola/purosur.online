import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { categories, prices, products } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededPriceListId } from "../test-support/seeded-price-list.js";
import { DrizzlePricingStore } from "./drizzle-pricing-store.js";

const MOMENT = new Date("2026-01-05T12:00:00.000Z");

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

async function insertProduct(): Promise<string> {
  const [category] = await db.insert(categories).values({ name: "Almacén" }).returning({
    id: categories.id,
  });
  if (!category) {
    throw new Error("test setup: seeding the category returned no row");
  }
  const [product] = await db
    .insert(products)
    .values({ name: "Arroz", categoryId: category.id, saleUnit: "UNIT" })
    .returning({ id: products.id });
  if (!product) {
    throw new Error("test setup: seeding the product returned no row");
  }
  return product.id;
}

describe("DrizzlePricingStore", () => {
  it("answers not_found for an id that is not a uuid instead of failing the query", async () => {
    const store = new DrizzlePricingStore(db);

    const locked = await store.transaction((tx) => tx.lockActiveProduct("not-a-uuid"));

    expect(locked).toEqual({ kind: "not_found" });
  });

  it("takes the price with the greater id as current when two share the newest moment", async () => {
    const productId = await insertProduct();
    const priceListId = await seededPriceListId(db);
    await db.insert(prices).values([
      {
        id: "00000000-0000-4000-8000-000000000002",
        productId,
        priceListId,
        unitPrice: 2000,
        validFrom: MOMENT,
      },
      {
        id: "00000000-0000-4000-8000-000000000001",
        productId,
        priceListId,
        unitPrice: 1000,
        validFrom: MOMENT,
      },
    ]);
    const store = new DrizzlePricingStore(db);

    const current = await store.transaction((tx) => tx.currentPrice(productId, priceListId));

    expect(current).toEqual({
      id: "00000000-0000-4000-8000-000000000002",
      unitPrice: 2000,
      validFrom: MOMENT,
    });
  });
});
