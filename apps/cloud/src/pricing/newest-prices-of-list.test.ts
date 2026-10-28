import type { CurrentPrice } from "@purosur/domain/pricing/use-cases";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { categories, priceLists, prices, products } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededPriceListId } from "../test-support/seeded-price-list.js";
import { newestPricesOfList } from "./newest-prices-of-list.js";

const LESSER_PRICE_ID = "00000000-0000-4000-8000-000000000001";
const GREATER_PRICE_ID = "00000000-0000-4000-8000-000000000002";
const MIDDLE_PRICE_ID = "00000000-0000-4000-8000-000000000003";
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
  id: string,
): Promise<void> {
  await db.insert(prices).values({ id, productId, priceListId, unitPrice, validFrom });
}

function price(id: string, unitPrice: number, validFrom: Date): CurrentPrice {
  return { id, unitPrice, validFrom };
}

describe("newestPricesOfList", () => {
  it("gives each product of the list its newest price", async () => {
    const productId = await insertProduct("Miel");
    const priceListId = await seededPriceListId(db);
    await insertPrice(productId, priceListId, 1000, JAN_1, LESSER_PRICE_ID);
    await insertPrice(productId, priceListId, 1300, JAN_3, GREATER_PRICE_ID);
    await insertPrice(productId, priceListId, 1200, JAN_2, MIDDLE_PRICE_ID);

    expect(await newestPricesOfList(db, priceListId, "all-products")).toEqual(
      new Map([[productId, price(GREATER_PRICE_ID, 1300, JAN_3)]]),
    );
  });

  it("leaves out a product without a price on the list", async () => {
    const priced = await insertProduct("Miel");
    await insertProduct("Almendras");
    const priceListId = await seededPriceListId(db);
    await insertPrice(priced, priceListId, 1000, JAN_1, LESSER_PRICE_ID);

    expect(await newestPricesOfList(db, priceListId, "all-products")).toEqual(
      new Map([[priced, price(LESSER_PRICE_ID, 1000, JAN_1)]]),
    );
  });

  it("ignores the prices of another list, even a newer one", async () => {
    const productId = await insertProduct("Miel");
    const priceListId = await seededPriceListId(db);
    await insertPrice(productId, priceListId, 1000, JAN_1, LESSER_PRICE_ID);
    await insertPrice(productId, await insertOtherPriceList(), 900, JAN_3, GREATER_PRICE_ID);

    expect(await newestPricesOfList(db, priceListId, "all-products")).toEqual(
      new Map([[productId, price(LESSER_PRICE_ID, 1000, JAN_1)]]),
    );
  });

  it("breaks a tie on the start date by the greater price id", async () => {
    const productId = await insertProduct("Miel");
    const priceListId = await seededPriceListId(db);
    await insertPrice(productId, priceListId, 1100, JAN_1, GREATER_PRICE_ID);
    await insertPrice(productId, priceListId, 1000, JAN_1, LESSER_PRICE_ID);

    expect(await newestPricesOfList(db, priceListId, "all-products")).toEqual(
      new Map([[productId, price(GREATER_PRICE_ID, 1100, JAN_1)]]),
    );
  });

  it("gives an inactive product its price only when every product is asked for", async () => {
    const active = await insertProduct("Miel");
    const inactive = await insertProduct("Almendras", false);
    const priceListId = await seededPriceListId(db);
    await insertPrice(active, priceListId, 1000, JAN_1, LESSER_PRICE_ID);
    await insertPrice(inactive, priceListId, 2000, JAN_1, GREATER_PRICE_ID);

    expect(await newestPricesOfList(db, priceListId, "active-products")).toEqual(
      new Map([[active, price(LESSER_PRICE_ID, 1000, JAN_1)]]),
    );
    expect(await newestPricesOfList(db, priceListId, "all-products")).toEqual(
      new Map([
        [active, price(LESSER_PRICE_ID, 1000, JAN_1)],
        [inactive, price(GREATER_PRICE_ID, 2000, JAN_1)],
      ]),
    );
  });
});
