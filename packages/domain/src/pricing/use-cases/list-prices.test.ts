import { describe, expect, it } from "vitest";
import type { CostSource } from "../model/price-cost-reference.js";
import { listPrices } from "./list-prices.js";
import type { PricesUnderReview, PriceUnderReview } from "./price-review-reader.js";
import { fakePriceCostReader } from "./test-support/fake-price-cost-reader.js";
import { fakePriceReviewReader } from "./test-support/fake-price-review-reader.js";

function product(id: string, unitPrice: number | null): PriceUnderReview {
  return {
    id,
    name: `Product ${id}`,
    categoryId: "category-1",
    categoryName: "Almacén",
    saleUnit: "UNIT",
    currentPrice:
      unitPrice === null
        ? null
        : { id: `price-${id}`, unitPrice, validFrom: new Date("2026-03-01T12:00:00Z") },
    pending: false,
    secondsSinceReview: 60,
  };
}

function listing(products: PriceUnderReview[]): PricesUnderReview {
  return {
    products,
    categories: [{ id: "category-1", name: "Almacén" }],
    pendingCount: 3,
    activeProductCount: 7,
    reviewWindowDays: 30,
  };
}

function purchase(lineId: string, totalCents: number): CostSource {
  return {
    kind: "purchase_line",
    lineId,
    purchasedOn: "2026-03-01",
    recordedAt: new Date("2026-03-01T10:00:00Z"),
    cost: { totalCents, quantity: 1000 },
  };
}

const query = {
  locationId: "location-1",
  now: new Date("2026-03-10T12:00:00Z"),
  review: "all" as const,
};

describe("listPrices", () => {
  it("gives each product the cost reference its cost sources and its price leave", async () => {
    const result = await listPrices(
      {
        reviews: fakePriceReviewReader(listing([product("a", 2000), product("b", 500)])),
        costs: fakePriceCostReader([
          { productId: "a", source: purchase("line-a", 1200) },
          { productId: "b", source: purchase("line-b", 250) },
        ]),
      },
      query,
    );

    expect(result.products.map(({ id, costReference }) => ({ id, costReference }))).toEqual([
      {
        id: "a",
        costReference: {
          lastCostCents: 1200,
          freightPerUnitCents: 0,
          totalCostCents: 1200,
          marginTenthsOfPercent: 400,
        },
      },
      {
        id: "b",
        costReference: {
          lastCostCents: 250,
          freightPerUnitCents: 0,
          totalCostCents: 250,
          marginTenthsOfPercent: 500,
        },
      },
    ]);
  });

  it("keeps the rest of the listing as the review reader answered it", async () => {
    const answered = listing([product("a", 2000)]);

    const result = await listPrices(
      {
        reviews: fakePriceReviewReader(answered),
        costs: fakePriceCostReader([{ productId: "a", source: purchase("line-a", 1200) }]),
      },
      query,
    );

    expect(result).toMatchObject({
      categories: answered.categories,
      pendingCount: 3,
      activeProductCount: 7,
      reviewWindowDays: 30,
    });
    expect(result.products[0]).toMatchObject({
      name: "Product a",
      currentPrice: answered.products[0]?.currentPrice,
      pending: false,
      secondsSinceReview: 60,
    });
  });

  it("shows no cost reference for a product with no cost source", async () => {
    const result = await listPrices(
      {
        reviews: fakePriceReviewReader(listing([product("a", 2000)])),
        costs: fakePriceCostReader([]),
      },
      query,
    );

    expect(result.products[0]?.costReference).toBeNull();
  });

  it("shows the cost but no margin for a product with no price", async () => {
    const result = await listPrices(
      {
        reviews: fakePriceReviewReader(listing([product("a", null)])),
        costs: fakePriceCostReader([{ productId: "a", source: purchase("line-a", 1200) }]),
      },
      query,
    );

    expect(result.products[0]?.costReference).toEqual({
      lastCostCents: 1200,
      freightPerUnitCents: 0,
      totalCostCents: 1200,
      marginTenthsOfPercent: null,
    });
  });

  it("picks the last cost among a product's sources", async () => {
    const result = await listPrices(
      {
        reviews: fakePriceReviewReader(listing([product("a", 2000)])),
        costs: fakePriceCostReader([
          { productId: "a", source: purchase("line-1", 1200) },
          {
            productId: "a",
            source: {
              kind: "initial_count",
              countedAt: new Date("2026-03-05T10:00:00Z"),
              withdrawn: false,
              costIncomplete: false,
              cost: { totalCents: 900, quantity: 1000 },
            },
          },
        ]),
      },
      query,
    );

    expect(result.products[0]?.costReference?.lastCostCents).toBe(900);
  });

  it("reads the costs of the listed products at the query's branch only", async () => {
    const costs = fakePriceCostReader([]);
    const reviews = fakePriceReviewReader(listing([product("a", 2000), product("b", 500)]));

    await listPrices({ reviews, costs }, query);

    expect(reviews.queries).toEqual([query]);
    expect(costs.askedProductIds).toEqual([["a", "b"]]);
  });
});
