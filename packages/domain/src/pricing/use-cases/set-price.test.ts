import { describe, expect, it } from "vitest";
import { setPrice } from "./set-price.js";
import { FakePricingStore, FixedClock } from "./test-support/fake-pricing-store.js";

const NOON = new Date("2026-01-05T12:00:00.000Z");
const EARLIER = new Date("2026-01-01T09:00:00.000Z");
const LATER = new Date("2026-01-09T09:00:00.000Z");

function storeWithProduct(active = true): FakePricingStore {
  const store = new FakePricingStore();
  store.seedProduct({ id: "decoy", active: true });
  store.seedProduct({ id: "product-1", active });
  return store;
}

function seedPrice(
  store: FakePricingStore,
  overrides: { id?: string; unitPrice?: number; validFrom?: Date; priceListId?: string } = {},
): void {
  store.seedPrice({
    id: "price-old",
    productId: "product-1",
    priceListId: "list-1",
    unitPrice: 1000,
    validFrom: EARLIER,
    ...overrides,
  });
}

function change(
  store: FakePricingStore,
  overrides: {
    productId?: string;
    unitPrice?: number;
    expectedCurrentPriceId?: string | null;
    now?: Date;
  } = {},
) {
  return setPrice(
    { store, clock: new FixedClock(overrides.now ?? NOON) },
    {
      productId: overrides.productId ?? "product-1",
      priceListId: "list-1",
      unitPrice: overrides.unitPrice ?? 1500,
      expectedCurrentPriceId:
        overrides.expectedCurrentPriceId === undefined ? null : overrides.expectedCurrentPriceId,
      actorId: "actor-1",
    },
  );
}

describe("setPrice", () => {
  it.each([
    ["doesn't exist", undefined],
    ["is inactive", false],
  ])("answers not_found for a product that %s, writing nothing", async (_case, active) => {
    const store = active === undefined ? storeWithProduct() : storeWithProduct(active);
    const before = store.snapshot();

    const outcome = await change(store, {
      productId: active === undefined ? "missing" : "product-1",
    });

    expect(outcome).toEqual({ kind: "not_found" });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).toEqual(["lockActiveProduct"]);
  });

  it("locks the product before it reads the current price", async () => {
    const store = storeWithProduct();

    await change(store);

    expect(store.operationOrder.slice(0, 2)).toEqual(["lockActiveProduct", "currentPrice"]);
  });

  it("reads before it writes, in the order of the rule", async () => {
    const store = storeWithProduct();

    await change(store);

    expect(store.operationOrder).toEqual([
      "lockActiveProduct",
      "currentPrice",
      "latestReviewedAt",
      "recordPrice",
      "recordPriceReview",
      "recordPriceChange",
    ]);
  });

  it("gives each new price its own id", async () => {
    const store = storeWithProduct();

    const first = await change(store, { unitPrice: 1000 });
    if (first.kind !== "applied") {
      throw new Error("test setup: the first price was not applied");
    }
    await change(store, { unitPrice: 1100, expectedCurrentPriceId: first.price.id, now: LATER });

    expect(store.snapshot().prices.map((row) => row.id)).toEqual(["price-1", "price-2"]);
  });

  it("runs entirely inside one transaction", async () => {
    const store = storeWithProduct();

    await change(store);

    expect(store.transactionCount).toBe(1);
  });

  it("gives a never-priced product its first price, recorded as a review and an audit row", async () => {
    const store = storeWithProduct();

    const outcome = await change(store, { unitPrice: 1500, expectedCurrentPriceId: null });

    expect(outcome).toEqual({
      kind: "applied",
      price: { id: "price-1", unitPrice: 1500, validFrom: NOON },
      lastReviewedAt: NOON,
    });
    const after = store.snapshot();
    expect(after.prices).toEqual([
      {
        id: "price-1",
        productId: "product-1",
        priceListId: "list-1",
        unitPrice: 1500,
        validFrom: NOON,
      },
    ]);
    expect(after.reviews).toEqual([
      {
        productId: "product-1",
        priceListId: "list-1",
        reviewedAt: NOON,
        actorId: "actor-1",
        priceId: "price-1",
      },
    ]);
    expect(after.priceChanges).toEqual([
      {
        productId: "product-1",
        actorId: "actor-1",
        previous: null,
        next: { priceId: "price-1", unitPrice: 1500 },
      },
    ]);
    expect(after.priceConfirmations).toEqual([]);
  });

  it("replaces the current price, keeping the old one and auditing both", async () => {
    const store = storeWithProduct();
    seedPrice(store, { id: "price-old", unitPrice: 1000 });

    const outcome = await change(store, { unitPrice: 1200, expectedCurrentPriceId: "price-old" });

    expect(outcome).toMatchObject({
      kind: "applied",
      price: { unitPrice: 1200, validFrom: NOON },
      lastReviewedAt: NOON,
    });
    const after = store.snapshot();
    expect(after.prices.map((row) => row.unitPrice).sort()).toEqual([1000, 1200]);
    expect(after.priceChanges).toEqual([
      {
        productId: "product-1",
        actorId: "actor-1",
        previous: { priceId: "price-old", unitPrice: 1000 },
        next: { priceId: "price-1", unitPrice: 1200 },
      },
    ]);
  });

  it("compares against the newest price of the product in the price list", async () => {
    const store = storeWithProduct();
    store.seedProduct({ id: "product-2", active: true });
    seedPrice(store, { id: "price-old", unitPrice: 1000, validFrom: EARLIER });
    seedPrice(store, {
      id: "price-newest",
      unitPrice: 1100,
      validFrom: new Date(EARLIER.getTime() + 1),
    });
    store.seedPrice({
      id: "price-other-product",
      productId: "product-2",
      priceListId: "list-1",
      unitPrice: 1,
      validFrom: LATER,
    });
    seedPrice(store, { id: "price-other-list", priceListId: "list-2", validFrom: LATER });

    const outcome = await change(store, { expectedCurrentPriceId: "price-newest" });

    expect(outcome.kind).toBe("applied");
  });

  it.each([
    ["a price exists but none was expected", null],
    ["another price was expected", "price-other"],
  ])("answers stale_price when %s, writing nothing", async (_case, expectedCurrentPriceId) => {
    const store = storeWithProduct();
    seedPrice(store);
    const before = store.snapshot();

    const outcome = await change(store, { expectedCurrentPriceId });

    expect(outcome).toEqual({ kind: "stale_price" });
    expect(store.snapshot()).toEqual(before);
  });

  it("answers stale_price when a price was expected and there is none", async () => {
    const store = storeWithProduct();

    const outcome = await change(store, { expectedCurrentPriceId: "price-old" });

    expect(outcome).toEqual({ kind: "stale_price" });
    expect(store.snapshot().prices).toEqual([]);
  });

  it("answers stale_price rather than price_unchanged when both apply", async () => {
    const store = storeWithProduct();
    seedPrice(store, { unitPrice: 1500 });

    const outcome = await change(store, { unitPrice: 1500, expectedCurrentPriceId: "price-other" });

    expect(outcome).toEqual({ kind: "stale_price" });
  });

  it("answers price_unchanged for the current price, writing nothing", async () => {
    const store = storeWithProduct();
    seedPrice(store, { id: "price-old", unitPrice: 1500 });
    const before = store.snapshot();

    const outcome = await change(store, { unitPrice: 1500, expectedCurrentPriceId: "price-old" });

    expect(outcome).toEqual({ kind: "price_unchanged" });
    expect(store.snapshot()).toEqual(before);
  });

  it("records the new price after the previous price when the clock is behind it", async () => {
    const store = storeWithProduct();
    seedPrice(store, { id: "price-old", validFrom: LATER });

    const outcome = await change(store, { expectedCurrentPriceId: "price-old", now: NOON });

    const moment = new Date(LATER.getTime() + 1);
    expect(outcome).toMatchObject({ price: { validFrom: moment }, lastReviewedAt: moment });
    expect(store.snapshot().reviews.map((row) => row.reviewedAt)).toEqual([moment]);
  });

  it("records the new price after the latest review when the clock is behind it", async () => {
    const store = storeWithProduct();
    seedPrice(store, { id: "price-old", validFrom: EARLIER });
    for (const reviewedAt of [NOON, LATER, EARLIER]) {
      store.seedReview({
        productId: "product-1",
        priceListId: "list-1",
        reviewedAt,
        actorId: "actor-9",
        priceId: "price-old",
      });
    }

    const outcome = await change(store, { expectedCurrentPriceId: "price-old", now: NOON });

    expect(outcome).toMatchObject({
      price: { validFrom: new Date(LATER.getTime() + 1) },
      lastReviewedAt: new Date(LATER.getTime() + 1),
    });
  });

  it("ignores the reviews of other products and price lists", async () => {
    const store = storeWithProduct();
    seedPrice(store, { id: "price-old" });
    store.seedReview({
      productId: "product-2",
      priceListId: "list-1",
      reviewedAt: LATER,
      actorId: "actor-9",
      priceId: "price-x",
    });
    store.seedReview({
      productId: "product-1",
      priceListId: "list-2",
      reviewedAt: LATER,
      actorId: "actor-9",
      priceId: "price-y",
    });

    const outcome = await change(store, { expectedCurrentPriceId: "price-old", now: NOON });

    expect(outcome).toMatchObject({ lastReviewedAt: NOON });
  });

  it.each(["recordPrice", "recordPriceReview", "recordPriceChange"] as const)(
    "leaves nothing behind when %s fails",
    async (failing) => {
      const store = storeWithProduct();
      seedPrice(store, { id: "price-old", unitPrice: 1000 });
      const before = store.snapshot();
      store.failingWrites.add(failing);

      await expect(
        change(store, { unitPrice: 1200, expectedCurrentPriceId: "price-old" }),
      ).rejects.toThrow(`${failing} failed`);

      expect(store.snapshot()).toEqual(before);
    },
  );
});
