import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  branchSettings,
  categories,
  locations,
  priceLists,
  priceReviews,
  prices,
  products,
  users,
} from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { seededPriceListId } from "../test-support/seeded-price-list.js";
import { DrizzlePriceReviewReader } from "./drizzle-price-review-reader.js";

const NOON = new Date("2026-01-05T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const GREATER_PRICE_ID = "00000000-0000-4000-8000-000000000002";
const LESSER_PRICE_ID = "00000000-0000-4000-8000-000000000001";

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

async function insertUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      locationId: await seededLocationId(db),
    })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: seeding the user returned no row");
  }
  return user.id;
}

async function insertCategory(name: string, parentId: string | null = null): Promise<string> {
  const [category] = await db
    .insert(categories)
    .values({ name, parentId })
    .returning({ id: categories.id });
  if (!category) {
    throw new Error("test setup: seeding the category returned no row");
  }
  return category.id;
}

async function insertProduct(name: string, categoryId: string): Promise<string> {
  const [product] = await db
    .insert(products)
    .values({ name, categoryId, saleUnit: "UNIT" })
    .returning({ id: products.id });
  if (!product) {
    throw new Error("test setup: seeding the product returned no row");
  }
  return product.id;
}

async function insertPrice(
  productId: string,
  priceListId: string,
  unitPrice: number,
  validFrom: Date,
  id?: string,
): Promise<string> {
  const [price] = await db
    .insert(prices)
    .values({ ...(id !== undefined ? { id } : {}), productId, priceListId, unitPrice, validFrom })
    .returning({ id: prices.id });
  if (!price) {
    throw new Error("test setup: seeding the price returned no row");
  }
  return price.id;
}

async function insertReview(
  productId: string,
  priceListId: string,
  priceId: string,
  actorId: string,
  reviewedAt: Date,
): Promise<void> {
  await db.insert(priceReviews).values({ productId, priceListId, priceId, actorId, reviewedAt });
}

async function setReviewWindow(days: number): Promise<void> {
  await db
    .update(branchSettings)
    .set({ unreviewedPriceAlertDays: days })
    .where(eq(branchSettings.locationId, await seededLocationId(db)));
}

async function pricesUnderReview(
  query: { review?: "pending" | "all"; categoryId?: string; search?: string; now?: Date } = {},
) {
  return new DrizzlePriceReviewReader(db).pricesUnderReview({
    locationId: await seededLocationId(db),
    now: NOON,
    review: "all",
    ...query,
  });
}

function ids(result: { products: { id: string }[] }): string[] {
  return result.products.map((product) => product.id);
}

describe("DrizzlePriceReviewReader", () => {
  it("reports the branch's own unreviewed-price window as reviewWindowDays", async () => {
    await setReviewWindow(45);

    expect((await pricesUnderReview()).reviewWindowDays).toBe(45);
  });

  it("refuses a branch with no settings", async () => {
    await expect(
      new DrizzlePriceReviewReader(db).pricesUnderReview({
        locationId: "00000000-0000-4000-8000-0000000000aa",
        now: NOON,
        review: "all",
      }),
    ).rejects.toThrow("branch settings missing for location 00000000-0000-4000-8000-0000000000aa");
  });

  it("reads the price list of the branch it is asked about", async () => {
    const userId = await insertUser();
    const categoryId = await insertCategory("Almacén");
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    const [otherPriceList] = await db
      .insert(priceLists)
      .values({ name: "Lista mayorista" })
      .returning({ id: priceLists.id });
    if (!otherLocation || !otherPriceList) {
      throw new Error("test setup: seeding the other branch returned no row");
    }
    await db
      .insert(branchSettings)
      .values({ locationId: otherLocation.id, priceListId: otherPriceList.id });
    const productId = await insertProduct("Arroz", categoryId);
    const priceId = await insertPrice(productId, otherPriceList.id, 999, NOON);
    await insertReview(productId, otherPriceList.id, priceId, userId, NOON);

    const result = await new DrizzlePriceReviewReader(db).pricesUnderReview({
      locationId: otherLocation.id,
      now: NOON,
      review: "all",
    });

    expect(result.products).toMatchObject([
      { id: productId, currentPrice: { id: priceId, unitPrice: 999 }, pending: false },
    ]);
  });

  it("hands every leaf category to filter by, ordered by path", async () => {
    const cleaning = await insertCategory("Limpieza");
    const groceries = await insertCategory("Almacén");

    expect((await pricesUnderReview({ review: "pending" })).categories).toEqual([
      { id: groceries, name: "Almacén" },
      { id: cleaning, name: "Limpieza" },
    ]);
  });

  it("excludes a parent category from the filter, since a product can never be assigned to it", async () => {
    const parent = await insertCategory("Almacén");
    const leaf = await insertCategory("Fiambres", parent);

    expect((await pricesUnderReview()).categories).toEqual([
      { id: leaf, name: "Almacén › Fiambres" },
    ]);
  });

  it("labels a leaf nested three levels deep with its whole path, from the top-level category down", async () => {
    const root = await insertCategory("Almacén");
    const middle = await insertCategory("Fiambres", root);
    const leaf = await insertCategory("Jamones", middle);

    expect((await pricesUnderReview()).categories).toEqual([
      { id: leaf, name: "Almacén › Fiambres › Jamones" },
    ]);
  });

  it("offers two leaves sharing a name under different parents, told apart by their paths", async () => {
    const groceries = await insertCategory("Almacén");
    const cleaning = await insertCategory("Limpieza");
    const groceriesDeals = await insertCategory("Ofertas", groceries);
    const cleaningDeals = await insertCategory("Ofertas", cleaning);

    expect((await pricesUnderReview()).categories).toEqual([
      { id: groceriesDeals, name: "Almacén › Ofertas" },
      { id: cleaningDeals, name: "Limpieza › Ofertas" },
    ]);
  });

  it("orders the filter by each leaf's full path, not by the leaf's own name", async () => {
    const groceries = await insertCategory("Almacén");
    const drinks = await insertCategory("Bebidas");
    const mate = await insertCategory("Yerba", groceries);
    const water = await insertCategory("Agua", drinks);

    expect((await pricesUnderReview()).categories).toEqual([
      { id: mate, name: "Almacén › Yerba" },
      { id: water, name: "Bebidas › Agua" },
    ]);
  });

  it("still answers when a corrupt parent chain loops back on itself", async () => {
    const first = await insertCategory("Almacén");
    const second = await insertCategory("Fiambres", first);
    const leaf = await insertCategory("Jamones", first);
    await db.update(categories).set({ parentId: second }).where(eq(categories.id, first));

    expect((await pricesUnderReview()).categories.map((category) => category.id)).toEqual([leaf]);
  });

  it("lists a never-priced product ahead of every reviewed one, as having no price", async () => {
    const userId = await insertUser();
    const categoryId = await insertCategory("Almacén");
    const priceListId = await seededPriceListId(db);
    const reviewedProductId = await insertProduct("Arroz", categoryId);
    const staleReviewedAt = new Date(NOON.getTime() - 40 * DAY_MS);
    const reviewedPriceId = await insertPrice(reviewedProductId, priceListId, 500, staleReviewedAt);
    await insertReview(reviewedProductId, priceListId, reviewedPriceId, userId, staleReviewedAt);
    const neverPricedProductId = await insertProduct("Fideos", categoryId);

    const result = await pricesUnderReview({ review: "pending" });

    expect(ids(result)).toEqual([neverPricedProductId, reviewedProductId]);
    expect(result.products[0]).toMatchObject({
      currentPrice: null,
      lastReviewedAt: null,
      pending: true,
      daysSinceReview: null,
    });
  });

  it("orders pending products from the oldest review to the most recent", async () => {
    const userId = await insertUser();
    const categoryId = await insertCategory("Almacén");
    const priceListId = await seededPriceListId(db);
    const olderAt = new Date(NOON.getTime() - 90 * DAY_MS);
    const newerAt = new Date(NOON.getTime() - 60 * DAY_MS);
    const olderProductId = await insertProduct("Yerba", categoryId);
    await insertReview(
      olderProductId,
      priceListId,
      await insertPrice(olderProductId, priceListId, 500, olderAt),
      userId,
      olderAt,
    );
    const newerProductId = await insertProduct("Azúcar", categoryId);
    await insertReview(
      newerProductId,
      priceListId,
      await insertPrice(newerProductId, priceListId, 300, newerAt),
      userId,
      newerAt,
    );
    await setReviewWindow(30);

    expect(ids(await pricesUnderReview({ review: "pending" }))).toEqual([
      olderProductId,
      newerProductId,
    ]);
  });

  it("marks each product pending against the branch's own window, and the pending filter keeps only those", async () => {
    const userId = await insertUser();
    const categoryId = await insertCategory("Almacén");
    const priceListId = await seededPriceListId(db);
    const tenDaysAgo = new Date(NOON.getTime() - 10 * DAY_MS);
    const overdueId = await insertProduct("Café", categoryId);
    await insertReview(
      overdueId,
      priceListId,
      await insertPrice(overdueId, priceListId, 500, tenDaysAgo),
      userId,
      tenDaysAgo,
    );
    const recentId = await insertProduct("Té", categoryId);
    await insertReview(
      recentId,
      priceListId,
      await insertPrice(recentId, priceListId, 300, NOON),
      userId,
      NOON,
    );
    await setReviewWindow(5);

    const all = await pricesUnderReview({ review: "all" });
    expect(
      all.products.map((product) => [product.id, product.pending, product.daysSinceReview]),
    ).toEqual([
      [overdueId, true, 10],
      [recentId, false, 0],
    ]);
    expect(ids(await pricesUnderReview({ review: "pending" }))).toEqual([overdueId]);
  });

  it("filters by category and by name search", async () => {
    const groceries = await insertCategory("Almacén");
    const cleaning = await insertCategory("Limpieza");
    const riceId = await insertProduct("Arroz", groceries);
    await insertProduct("Detergente", cleaning);

    expect(ids(await pricesUnderReview({ categoryId: groceries }))).toEqual([riceId]);
    expect(ids(await pricesUnderReview({ search: "arr" }))).toEqual([riceId]);
  });

  it("ignores a category filter that is not an id", async () => {
    const categoryId = await insertCategory("Almacén");
    const productId = await insertProduct("Arroz", categoryId);

    expect(ids(await pricesUnderReview({ categoryId: "not-an-id" }))).toEqual([productId]);
  });

  it("reports the pending count regardless of the active filter", async () => {
    const userId = await insertUser();
    const categoryId = await insertCategory("Almacén");
    const priceListId = await seededPriceListId(db);
    await insertProduct("Fideos", categoryId);
    const reviewedProductId = await insertProduct("Arroz", categoryId);
    await insertReview(
      reviewedProductId,
      priceListId,
      await insertPrice(reviewedProductId, priceListId, 500, NOON),
      userId,
      NOON,
    );

    const result = await pricesUnderReview({ categoryId: "00000000-0000-0000-0000-000000000000" });

    expect(result.products).toEqual([]);
    expect(result.pendingCount).toBe(1);
  });

  it("leaves a deactivated product out of the list and its pending count", async () => {
    const categoryId = await insertCategory("Almacén");
    const activeId = await insertProduct("Fideos", categoryId);
    const inactiveId = await insertProduct("Arroz", categoryId);
    await db.update(products).set({ active: false }).where(eq(products.id, inactiveId));

    const result = await pricesUnderReview();

    expect(ids(result)).toEqual([activeId]);
    expect(result.pendingCount).toBe(1);
  });

  it("counts every active product whatever the filters, and leaves a deactivated one out", async () => {
    const userId = await insertUser();
    const groceries = await insertCategory("Almacén");
    const cleaning = await insertCategory("Limpieza");
    const priceListId = await seededPriceListId(db);
    const riceId = await insertProduct("Arroz", groceries);
    await insertProduct("Fideos", groceries);
    await insertProduct("Detergente", cleaning);
    const inactiveId = await insertProduct("Lavandina", cleaning);
    await db.update(products).set({ active: false }).where(eq(products.id, inactiveId));
    await insertReview(
      riceId,
      priceListId,
      await insertPrice(riceId, priceListId, 500, NOON),
      userId,
      NOON,
    );

    const filters = [
      { review: "all" },
      { review: "pending" },
      { review: "all", categoryId: cleaning },
      { review: "all", search: "arr" },
    ] as const;
    for (const filter of filters) {
      expect((await pricesUnderReview(filter)).activeProductCount).toBe(3);
    }
  });

  it("reports no active products for an empty catalog", async () => {
    expect((await pricesUnderReview({ review: "pending" })).activeProductCount).toBe(0);
  });

  it("shows each product's newest price and newest review, whatever older history it has", async () => {
    const userId = await insertUser();
    const categoryId = await insertCategory("Almacén");
    const priceListId = await seededPriceListId(db);
    const riceId = await insertProduct("Arroz", categoryId);
    const oldest = new Date(NOON.getTime() - 90 * DAY_MS);
    const older = new Date(NOON.getTime() - 60 * DAY_MS);
    const newest = new Date(NOON.getTime() - 10 * DAY_MS);
    const oldestPriceId = await insertPrice(riceId, priceListId, 300, oldest);
    await insertReview(riceId, priceListId, oldestPriceId, userId, oldest);
    const newestPriceId = await insertPrice(riceId, priceListId, 800, newest);
    const olderPriceId = await insertPrice(riceId, priceListId, 500, older);
    await insertReview(riceId, priceListId, newestPriceId, userId, newest);
    await insertReview(riceId, priceListId, olderPriceId, userId, older);
    const noodlesId = await insertProduct("Fideos", categoryId);
    const noodlesPriceId = await insertPrice(noodlesId, priceListId, 200, oldest);
    await insertReview(noodlesId, priceListId, noodlesPriceId, userId, oldest);

    expect((await pricesUnderReview()).products).toMatchObject([
      {
        id: riceId,
        currentPrice: { id: newestPriceId, unitPrice: 800, validFrom: newest },
        lastReviewedAt: newest,
      },
      {
        id: noodlesId,
        currentPrice: { id: noodlesPriceId, unitPrice: 200, validFrom: oldest },
        lastReviewedAt: oldest,
      },
    ]);
  });

  it.each([
    ["greater", [GREATER_PRICE_ID, LESSER_PRICE_ID]],
    ["lesser", [LESSER_PRICE_ID, GREATER_PRICE_ID]],
  ])(
    "shows the price with the greater id when two share a product's newest start, the %s id inserted first",
    async (_case, insertionOrder) => {
      const categoryId = await insertCategory("Almacén");
      const priceListId = await seededPriceListId(db);
      const productId = await insertProduct("Arroz", categoryId);
      const start = new Date(NOON.getTime() - DAY_MS);
      for (const id of insertionOrder) {
        await insertPrice(productId, priceListId, id === GREATER_PRICE_ID ? 800 : 500, start, id);
      }

      expect((await pricesUnderReview()).products).toMatchObject([
        { currentPrice: { id: GREATER_PRICE_ID, unitPrice: 800, validFrom: start } },
      ]);
    },
  );

  it("shows a product's newest price even when it starts later than the request's own clock", async () => {
    const categoryId = await insertCategory("Almacén");
    const priceListId = await seededPriceListId(db);
    const productId = await insertProduct("Arroz", categoryId);
    await insertPrice(productId, priceListId, 500, new Date(NOON.getTime() - DAY_MS));
    const aheadOfNoon = new Date(NOON.getTime() + 5000);
    const newestPriceId = await insertPrice(productId, priceListId, 800, aheadOfNoon);

    expect((await pricesUnderReview()).products).toMatchObject([
      { currentPrice: { id: newestPriceId, unitPrice: 800, validFrom: aheadOfNoon } },
    ]);
  });

  it("only counts prices and reviews on the branch's own price list", async () => {
    const userId = await insertUser();
    const categoryId = await insertCategory("Almacén");
    const [otherPriceList] = await db
      .insert(priceLists)
      .values({ name: "Lista mayorista" })
      .returning({ id: priceLists.id });
    if (!otherPriceList) {
      throw new Error("test setup: seeding the other price list returned no row");
    }
    const productId = await insertProduct("Arroz", categoryId);
    const otherListPriceId = await insertPrice(productId, otherPriceList.id, 999, NOON);
    await insertReview(productId, otherPriceList.id, otherListPriceId, userId, NOON);

    expect((await pricesUnderReview()).products).toMatchObject([
      { currentPrice: null, lastReviewedAt: null },
    ]);
  });
});
