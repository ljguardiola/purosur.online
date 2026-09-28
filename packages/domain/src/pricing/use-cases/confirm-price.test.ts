import { describe, expect, it } from "vitest";
import { confirmPrice } from "./confirm-price.js";
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
  overrides: { id?: string; validFrom?: Date; productId?: string; priceListId?: string } = {},
): void {
  store.seedPrice({
    id: "price-current",
    productId: "product-1",
    priceListId: "list-1",
    unitPrice: 1000,
    validFrom: EARLIER,
    ...overrides,
  });
}

function seedReview(
  store: FakePricingStore,
  reviewedAt: Date,
  overrides: { productId?: string; priceListId?: string } = {},
): void {
  store.seedReview({
    productId: "product-1",
    priceListId: "list-1",
    reviewedAt,
    actorId: "actor-9",
    priceId: "price-current",
    ...overrides,
  });
}

function confirm(
  store: FakePricingStore,
  expectedCurrentPriceId = "price-current",
  now = NOON,
  productId = "product-1",
) {
  return confirmPrice(
    { store, clock: new FixedClock(now) },
    { productId, priceListId: "list-1", expectedCurrentPriceId, actorId: "actor-1" },
  );
}

describe("confirmPrice", () => {
  it.each([
    ["doesn't exist", undefined],
    ["is inactive", false],
  ])("answers not_found for a product that %s, writing nothing", async (_case, active) => {
    const store = storeWithProduct(active);
    const before = store.snapshot();

    const outcome = await confirm(
      store,
      "price-current",
      NOON,
      active === undefined ? "missing" : "product-1",
    );

    expect(outcome).toEqual({ kind: "not_found" });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).toEqual(["lockActiveProduct"]);
  });

  it("locks the product before it reads the current price", async () => {
    const store = storeWithProduct();
    seedPrice(store);

    await confirm(store);

    expect(store.operationOrder.slice(0, 2)).toEqual(["lockActiveProduct", "currentPrice"]);
  });

  it("reads before it writes, in the order of the rule", async () => {
    const store = storeWithProduct();
    seedPrice(store);

    await confirm(store);

    expect(store.operationOrder).toEqual([
      "lockActiveProduct",
      "currentPrice",
      "latestReviewedAt",
      "recordPriceReview",
      "recordPriceConfirmation",
    ]);
  });

  it("runs entirely inside one transaction", async () => {
    const store = storeWithProduct();
    seedPrice(store);

    await confirm(store);

    expect(store.transactionCount).toBe(1);
  });

  it("answers no_price_to_confirm for a product with no price in the list, writing nothing", async () => {
    const store = storeWithProduct();
    seedPrice(store, { priceListId: "list-2" });
    seedPrice(store, { id: "price-other-product", productId: "product-2" });
    const before = store.snapshot();

    const outcome = await confirm(store);

    expect(outcome).toEqual({ kind: "no_price_to_confirm" });
    expect(store.snapshot()).toEqual(before);
  });

  it("answers stale_price when the current price is not the one expected, writing nothing", async () => {
    const store = storeWithProduct();
    seedPrice(store);
    const before = store.snapshot();

    const outcome = await confirm(store, "price-other");

    expect(outcome).toEqual({ kind: "stale_price" });
    expect(store.snapshot()).toEqual(before);
  });

  it("confirms the newest price, recording a review and an audit row but no new price", async () => {
    const store = storeWithProduct();
    seedPrice(store, { id: "price-superseded", validFrom: EARLIER });
    seedPrice(store, { id: "price-current", validFrom: new Date(EARLIER.getTime() + 1) });

    const outcome = await confirm(store);

    expect(outcome).toEqual({ kind: "confirmed", lastReviewedAt: NOON });
    const after = store.snapshot();
    expect(after.prices).toHaveLength(2);
    expect(after.reviews).toEqual([
      {
        productId: "product-1",
        priceListId: "list-1",
        reviewedAt: NOON,
        actorId: "actor-1",
        priceId: "price-current",
      },
    ]);
    expect(after.priceConfirmations).toEqual([
      { productId: "product-1", actorId: "actor-1", priceId: "price-current" },
    ]);
    expect(after.priceChanges).toEqual([]);
  });

  it.each([
    ["lesser", ["price-1", "price-2"]],
    ["greater", ["price-2", "price-1"]],
  ])(
    "takes the price with the greater id as current when two share the newest moment, the %s id seeded first",
    async (_case, seedingOrder) => {
      const store = storeWithProduct();
      for (const id of seedingOrder) {
        seedPrice(store, { id, validFrom: EARLIER });
      }

      const outcome = await confirm(store, "price-2");

      expect(outcome).toEqual({ kind: "confirmed", lastReviewedAt: NOON });
      expect(store.snapshot().priceConfirmations).toEqual([
        { productId: "product-1", actorId: "actor-1", priceId: "price-2" },
      ]);
    },
  );

  it("records the review after the latest one when the clock is behind it", async () => {
    const store = storeWithProduct();
    seedPrice(store);
    for (const reviewedAt of [NOON, LATER, EARLIER]) {
      seedReview(store, reviewedAt);
    }

    const outcome = await confirm(store, "price-current", NOON);

    expect(outcome).toEqual({ kind: "confirmed", lastReviewedAt: new Date(LATER.getTime() + 1) });
  });

  it("ignores the reviews of other products and price lists", async () => {
    const store = storeWithProduct();
    seedPrice(store);
    seedReview(store, LATER, { productId: "product-2" });
    seedReview(store, LATER, { priceListId: "list-2" });

    const outcome = await confirm(store);

    expect(outcome).toEqual({ kind: "confirmed", lastReviewedAt: NOON });
  });

  it("is not held back by a price that starts after the clock", async () => {
    const store = storeWithProduct();
    seedPrice(store, { validFrom: LATER });

    const outcome = await confirm(store);

    expect(outcome).toEqual({ kind: "confirmed", lastReviewedAt: NOON });
  });

  it.each(["recordPriceReview", "recordPriceConfirmation"] as const)(
    "leaves nothing behind when %s fails",
    async (failing) => {
      const store = storeWithProduct();
      seedPrice(store);
      const before = store.snapshot();
      store.failingWrites.add(failing);

      await expect(confirm(store)).rejects.toThrow(`${failing} failed`);

      expect(store.snapshot()).toEqual(before);
    },
  );
});
