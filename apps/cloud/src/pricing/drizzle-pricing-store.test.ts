import { confirmPrice, setPrice } from "@purosur/domain/pricing/use-cases";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  auditLog,
  categories,
  priceLists,
  priceReviews,
  prices,
  products,
  users,
} from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { seededPriceListId } from "../test-support/seeded-price-list.js";
import { DrizzlePricingStore } from "./drizzle-pricing-store.js";
import { listPrices } from "./prices-list-route.js";

const MOMENT = new Date("2026-01-05T12:00:00.000Z");
const EARLIER = new Date("2026-01-01T09:00:00.000Z");
const LATER = new Date("2026-01-09T09:00:00.000Z");
const GREATER_ID = "00000000-0000-4000-8000-000000000002";
const LESSER_ID = "00000000-0000-4000-8000-000000000001";

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

async function insertProduct(active = true): Promise<string> {
  const [category] = await db.insert(categories).values({ name: "Almacén" }).returning({
    id: categories.id,
  });
  if (!category) {
    throw new Error("test setup: seeding the category returned no row");
  }
  const [product] = await db
    .insert(products)
    .values({ name: "Arroz", categoryId: category.id, saleUnit: "UNIT", active })
    .returning({ id: products.id });
  if (!product) {
    throw new Error("test setup: seeding the product returned no row");
  }
  return product.id;
}

async function insertUser(): Promise<string> {
  const locationId = await seededLocationId(db);
  const [user] = await db
    .insert(users)
    .values({ firstName: "Ada Lovelace", email: "ada@example.com", locationId })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: seeding the user returned no row");
  }
  return user.id;
}

async function insertOtherPriceList(): Promise<string> {
  const [priceList] = await db
    .insert(priceLists)
    .values({ name: "Lista mayorista" })
    .returning({ id: priceLists.id });
  if (!priceList) {
    throw new Error("test setup: seeding the other price list returned no row");
  }
  return priceList.id;
}

function pricingPortsAt(moment: Date) {
  return { store: new DrizzlePricingStore(db), clock: { now: () => moment } };
}

async function auditRows() {
  return db
    .select({
      entity: auditLog.entity,
      entityId: auditLog.entityId,
      actorId: auditLog.actorId,
      previousValue: auditLog.previousValue,
      newValue: auditLog.newValue,
    })
    .from(auditLog);
}

describe("DrizzlePricingStore", () => {
  it("answers not_found for an id that is not a uuid instead of failing the query", async () => {
    const store = new DrizzlePricingStore(db);

    const locked = await store.transaction((tx) => tx.lockActiveProduct("not-a-uuid"));

    expect(locked).toEqual({ kind: "not_found" });
  });

  it.each([
    ["greater", [GREATER_ID, LESSER_ID]],
    ["lesser", [LESSER_ID, GREATER_ID]],
  ])(
    "takes the price with the greater id as current when two share the newest moment, the %s id inserted first",
    async (_case, insertionOrder) => {
      const productId = await insertProduct();
      const priceListId = await seededPriceListId(db);
      await db.insert(prices).values(
        insertionOrder.map((id) => ({
          id,
          productId,
          priceListId,
          unitPrice: id === GREATER_ID ? 2000 : 1000,
          validFrom: MOMENT,
        })),
      );
      const store = new DrizzlePricingStore(db);

      const current = await store.transaction((tx) => tx.currentPrice(productId, priceListId));

      expect(current).toEqual({ id: GREATER_ID, unitPrice: 2000, validFrom: MOMENT });
    },
  );

  it.each([
    ["an active product", true, { kind: "locked" }],
    ["a deactivated product", false, { kind: "not_found" }],
  ])("locks a product only while it is active: %s", async (_case, active, expected) => {
    const productId = await insertProduct(active);
    const store = new DrizzlePricingStore(db);

    const locked = await store.transaction((tx) => tx.lockActiveProduct(productId));

    expect(locked).toEqual(expected);
  });

  it("reads the current price from the requested price list only", async () => {
    const productId = await insertProduct();
    const priceListId = await seededPriceListId(db);
    const otherPriceListId = await insertOtherPriceList();
    await db.insert(prices).values([
      { id: LESSER_ID, productId, priceListId, unitPrice: 1000, validFrom: EARLIER },
      {
        id: GREATER_ID,
        productId,
        priceListId: otherPriceListId,
        unitPrice: 9000,
        validFrom: LATER,
      },
    ]);
    const store = new DrizzlePricingStore(db);

    const current = await store.transaction((tx) => tx.currentPrice(productId, priceListId));

    expect(current).toEqual({ id: LESSER_ID, unitPrice: 1000, validFrom: EARLIER });
  });

  it("answers the latest review's moment", async () => {
    const productId = await insertProduct();
    const priceListId = await seededPriceListId(db);
    const actorId = await insertUser();
    await db
      .insert(prices)
      .values({ id: LESSER_ID, productId, priceListId, unitPrice: 1000, validFrom: EARLIER });
    await db.insert(priceReviews).values(
      [EARLIER, LATER, MOMENT].map((reviewedAt) => ({
        productId,
        priceListId,
        reviewedAt,
        actorId,
        priceId: LESSER_ID,
      })),
    );
    const store = new DrizzlePricingStore(db);

    const latest = await store.transaction((tx) => tx.latestReviewedAt(productId, priceListId));

    expect(latest).toEqual(LATER);
  });

  it.each([
    ["a first price", null],
    ["a replaced price", { priceId: LESSER_ID, unitPrice: 1000 }],
  ])("audits %s as a product price change", async (_case, previous) => {
    const productId = await insertProduct();
    const actorId = await insertUser();
    const store = new DrizzlePricingStore(db);

    await store.transaction((tx) =>
      tx.recordPriceChange({
        productId,
        actorId,
        previous,
        next: { priceId: GREATER_ID, unitPrice: 1200 },
      }),
    );

    expect(await auditRows()).toEqual([
      {
        entity: "product_price",
        entityId: productId,
        actorId,
        previousValue: previous,
        newValue: { priceId: GREATER_ID, unitPrice: 1200 },
      },
    ]);
  });

  it("audits a confirmation as a product price review", async () => {
    const productId = await insertProduct();
    const actorId = await insertUser();
    const store = new DrizzlePricingStore(db);

    await store.transaction((tx) =>
      tx.recordPriceConfirmation({ productId, actorId, priceId: LESSER_ID }),
    );

    expect(await auditRows()).toEqual([
      {
        entity: "product_price_review",
        entityId: productId,
        actorId,
        previousValue: null,
        newValue: { priceId: LESSER_ID },
      },
    ]);
  });
});

describe("price changes committed by callers whose clocks disagree", () => {
  it("makes current a change from an earlier clock made over the price it saw", async () => {
    const priceListId = await seededPriceListId(db);
    const actorId = await insertUser();
    const productId = await insertProduct();
    const laterMoment = new Date("2026-01-05T12:00:05.000Z");

    const first = await setPrice(pricingPortsAt(laterMoment), {
      productId,
      priceListId,
      unitPrice: 1000,
      expectedCurrentPriceId: null,
      actorId,
    });
    if (first.kind !== "applied") {
      throw new Error("test setup: the first price was not applied");
    }
    const earlierClock = await setPrice(pricingPortsAt(MOMENT), {
      productId,
      priceListId,
      unitPrice: 2000,
      expectedCurrentPriceId: first.price.id,
      actorId,
    });
    if (earlierClock.kind !== "applied") {
      throw new Error(`expected the earlier clock's change to apply, got ${earlierClock.kind}`);
    }
    expect(earlierClock.price.validFrom.getTime()).toBeGreaterThan(laterMoment.getTime());
    expect(earlierClock.lastReviewedAt).toEqual(earlierClock.price.validFrom);

    const listed = await listPrices(db, {
      priceListId,
      now: MOMENT,
      unreviewedPriceAlertDays: 30,
      review: "all",
    });
    expect(listed.products.find((product) => product.id === productId)).toMatchObject({
      currentPrice: { id: earlierClock.price.id, unitPrice: 2000 },
      lastReviewedAt: earlierClock.lastReviewedAt,
    });
  });
});

describe("confirmations committed by callers whose clocks disagree", () => {
  it("records a confirmation from an earlier clock as the product's most recent review", async () => {
    const priceListId = await seededPriceListId(db);
    const actorId = await insertUser();
    const productId = await insertProduct();
    const laterMoment = new Date("2026-01-05T12:00:05.000Z");

    const first = await setPrice(pricingPortsAt(laterMoment), {
      productId,
      priceListId,
      unitPrice: 1000,
      expectedCurrentPriceId: null,
      actorId,
    });
    if (first.kind !== "applied") {
      throw new Error("test setup: the first price was not applied");
    }

    const confirmation = await confirmPrice(pricingPortsAt(MOMENT), {
      productId,
      priceListId,
      expectedCurrentPriceId: first.price.id,
      actorId,
    });
    if (confirmation.kind !== "confirmed") {
      throw new Error(`expected the confirmation to apply, got ${confirmation.kind}`);
    }
    expect(confirmation.lastReviewedAt.getTime()).toBeGreaterThan(laterMoment.getTime());

    const listed = await listPrices(db, {
      priceListId,
      now: laterMoment,
      unreviewedPriceAlertDays: 30,
      review: "all",
    });
    expect(listed.products.find((product) => product.id === productId)).toMatchObject({
      lastReviewedAt: confirmation.lastReviewedAt,
    });
  });
});
