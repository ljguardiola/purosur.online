import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { categories, priceLists, prices, products } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { seededPriceListId } from "../test-support/seeded-price-list.js";
import { DrizzleCurrentPriceReader } from "./drizzle-current-price-reader.js";

const JAN_1 = new Date("2026-01-01T00:00:00.000Z");
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
): Promise<void> {
  await db.insert(prices).values({ productId, priceListId, unitPrice, validFrom });
}

async function currentUnitPrices(): Promise<Map<string, number>> {
  return new DrizzleCurrentPriceReader(db).currentUnitPrices(await seededLocationId(db));
}

describe("DrizzleCurrentPriceReader", () => {
  it("ignores the prices of another price list", async () => {
    const productId = await insertProduct("Miel");
    const priceListId = await seededPriceListId(db);
    const otherPriceListId = await insertOtherPriceList();
    await insertPrice(productId, priceListId, 1000, JAN_1);
    await insertPrice(productId, otherPriceListId, 900, JAN_3);

    expect(await currentUnitPrices()).toEqual(new Map([[productId, 1000]]));
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

  describe("currentPriceOf", () => {
    async function currentPriceOf(productId: string) {
      return new DrizzleCurrentPriceReader(db).currentPriceOf(
        await seededLocationId(db),
        productId,
      );
    }

    it("gives the newest price of the branch's list with its id and start", async () => {
      const productId = await insertProduct("Miel");
      const priceListId = await seededPriceListId(db);
      await insertPrice(productId, priceListId, 900, JAN_1);
      await insertPrice(productId, priceListId, 1000, JAN_3);

      expect(await currentPriceOf(productId)).toEqual({
        id: expect.any(String),
        unitPrice: 1000,
        validFrom: JAN_3,
      });
    });

    it("gives the price of the product asked for, not another's", async () => {
      const honey = await insertProduct("Miel");
      const jam = await insertProduct("Dulce");
      const priceListId = await seededPriceListId(db);
      await insertPrice(honey, priceListId, 1000, JAN_1);
      await insertPrice(jam, priceListId, 700, JAN_1);

      expect(await currentPriceOf(jam)).toMatchObject({ unitPrice: 700 });
    });

    it("ignores the prices of another price list", async () => {
      const productId = await insertProduct("Miel");
      await insertPrice(productId, await insertOtherPriceList(), 900, JAN_3);

      expect(await currentPriceOf(productId)).toBeNull();
    });

    it("gives null for a product with no price", async () => {
      expect(await currentPriceOf(await insertProduct("Miel"))).toBeNull();
    });

    it("refuses a branch with no settings", async () => {
      await expect(
        new DrizzleCurrentPriceReader(db).currentPriceOf(
          "00000000-0000-4000-8000-0000000000aa",
          await insertProduct("Miel"),
        ),
      ).rejects.toThrow("branch settings missing");
    });
  });
});
