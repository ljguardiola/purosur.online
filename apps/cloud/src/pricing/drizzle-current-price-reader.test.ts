import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { categories, priceLists, prices, products } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { seededPriceListId } from "../test-support/seeded-price-list.js";
import { DrizzleCurrentPriceReader } from "./drizzle-current-price-reader.js";

const LESSER_PRICE_ID = "00000000-0000-4000-8000-000000000001";
const GREATER_PRICE_ID = "00000000-0000-4000-8000-000000000002";
const JAN_1 = new Date("2026-01-01T00:00:00.000Z");
const JAN_2 = new Date("2026-01-02T00:00:00.000Z");
const JAN_3 = new Date("2026-01-03T00:00:00.000Z");

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

async function insertProduct(name: string, active = true): Promise<string> {
  const [category] = await db
    .insert(categories)
    .values({ name: `Categoría de ${name}` })
    .returning({ id: categories.id });
  if (!category) {
    throw new Error("test setup: seeding the category returned no row");
  }
  const [product] = await db
    .insert(products)
    .values({ name, categoryId: category.id, saleUnit: "UNIT", active })
    .returning({ id: products.id });
  if (!product) {
    throw new Error("test setup: seeding the product returned no row");
  }
  return product.id;
}

async function insertOtherPriceList(): Promise<string> {
  const [priceList] = await db
    .insert(priceLists)
    .values({ name: "Mayorista" })
    .returning({ id: priceLists.id });
  if (!priceList) {
    throw new Error("test setup: seeding the price list returned no row");
  }
  return priceList.id;
}

async function insertPrice(
  productId: string,
  priceListId: string,
  unitPrice: number,
  validFrom: Date,
  id?: string,
): Promise<void> {
  await db
    .insert(prices)
    .values({ ...(id !== undefined ? { id } : {}), productId, priceListId, unitPrice, validFrom });
}

async function currentUnitPrices(): Promise<Map<string, number>> {
  return new DrizzleCurrentPriceReader(db).currentUnitPrices(await seededLocationId(db));
}

describe("DrizzleCurrentPriceReader", () => {
  it("reports the newest price of a product that has several", async () => {
    const productId = await insertProduct("Miel");
    const priceListId = await seededPriceListId(db);
    await insertPrice(productId, priceListId, 1000, JAN_1);
    await insertPrice(productId, priceListId, 1300, JAN_3);
    await insertPrice(productId, priceListId, 1200, JAN_2);

    expect(await currentUnitPrices()).toEqual(new Map([[productId, 1300]]));
  });

  it("leaves out a product without a price", async () => {
    const priced = await insertProduct("Miel");
    await insertProduct("Almendras");
    await insertPrice(priced, await seededPriceListId(db), 1000, JAN_1);

    expect(await currentUnitPrices()).toEqual(new Map([[priced, 1000]]));
  });

  it("ignores the prices of another price list", async () => {
    const productId = await insertProduct("Miel");
    const priceListId = await seededPriceListId(db);
    const otherPriceListId = await insertOtherPriceList();
    await insertPrice(productId, priceListId, 1000, JAN_1);
    await insertPrice(productId, otherPriceListId, 900, JAN_3);

    expect(await currentUnitPrices()).toEqual(new Map([[productId, 1000]]));
  });

  it("breaks a tie on the start date by the greater price id", async () => {
    const productId = await insertProduct("Miel");
    const priceListId = await seededPriceListId(db);
    await insertPrice(productId, priceListId, 1100, JAN_1, GREATER_PRICE_ID);
    await insertPrice(productId, priceListId, 1000, JAN_1, LESSER_PRICE_ID);

    expect(await currentUnitPrices()).toEqual(new Map([[productId, 1100]]));
  });

  it("reports the price of an inactive product too", async () => {
    const productId = await insertProduct("Miel", false);
    await insertPrice(productId, await seededPriceListId(db), 1000, JAN_1);

    expect(await currentUnitPrices()).toEqual(new Map([[productId, 1000]]));
  });

  it("refuses a branch with no settings", async () => {
    await expect(
      new DrizzleCurrentPriceReader(db).currentUnitPrices("00000000-0000-4000-8000-0000000000aa"),
    ).rejects.toThrow("branch settings missing");
  });
});
