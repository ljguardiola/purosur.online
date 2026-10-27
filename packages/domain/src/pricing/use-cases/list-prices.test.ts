import { describe, expect, it } from "vitest";
import { FakeZoneRulesSource } from "../../shared/test-support/fake-zone-rules-source.js";
import type { AssemblyBatchCost } from "./assembly-batch-cost-reader.js";
import type { InitialCountCost } from "./initial-count-cost-reader.js";
import { listPrices } from "./list-prices.js";
import type { PricesUnderReview, PriceUnderReview } from "./price-review-reader.js";
import type { PurchaseLineCost } from "./purchase-cost-reader.js";
import { fakeAssemblyBatchCostReader } from "./test-support/fake-assembly-batch-cost-reader.js";
import { fakeInitialCountCostReader } from "./test-support/fake-initial-count-cost-reader.js";
import { fakePriceReviewReader } from "./test-support/fake-price-review-reader.js";
import { fakePurchaseCostReader } from "./test-support/fake-purchase-cost-reader.js";

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

function purchase(
  productId: string,
  lineId: string,
  totalCents: number,
  freights: PurchaseLineCost["freights"] = [],
): PurchaseLineCost {
  return {
    productId,
    lineId,
    purchasedOn: "2026-03-01",
    recordedAt: new Date("2026-03-01T10:00:00Z"),
    cost: { totalCents, quantity: 1000 },
    freights,
  };
}

function counted(productId: string, totalCents: number): InitialCountCost {
  return {
    productId,
    countedAt: new Date("2026-03-05T10:00:00Z"),
    withdrawn: false,
    costIncomplete: false,
    cost: { totalCents, quantity: 1000 },
  };
}

function assembled(
  productId: string,
  totalCents: number,
  costIncomplete = false,
): AssemblyBatchCost {
  return {
    productId,
    batchId: "batch-1",
    assembledAt: new Date("2026-03-08T10:00:00Z"),
    cost: { totalCents, quantity: 1000 },
    costIncomplete,
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
        zoneRules: new FakeZoneRulesSource(),
        reviews: fakePriceReviewReader(listing([product("a", 2000), product("b", 500)])),
        purchaseCosts: fakePurchaseCostReader([
          purchase("a", "line-a", 1200),
          purchase("b", "line-b", 250),
        ]),
        initialCountCosts: fakeInitialCountCostReader([]),
        batchCosts: fakeAssemblyBatchCostReader([]),
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
          costIncomplete: false,
        },
      },
      {
        id: "b",
        costReference: {
          lastCostCents: 250,
          freightPerUnitCents: 0,
          totalCostCents: 250,
          marginTenthsOfPercent: 500,
          costIncomplete: false,
        },
      },
    ]);
  });

  it("keeps the rest of the listing as the review reader answered it", async () => {
    const answered = listing([product("a", 2000)]);

    const result = await listPrices(
      {
        zoneRules: new FakeZoneRulesSource(),
        reviews: fakePriceReviewReader(answered),
        purchaseCosts: fakePurchaseCostReader([purchase("a", "line-a", 1200)]),
        initialCountCosts: fakeInitialCountCostReader([]),
        batchCosts: fakeAssemblyBatchCostReader([]),
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

  it("adds the freight of the purchase line the last cost comes from", async () => {
    const freights = [
      {
        amountCents: 300,
        lines: [{ id: "line-a", costPaidCents: 1200, quantity: 1000, quantityPerPackage: 1000 }],
      },
    ];

    const result = await listPrices(
      {
        zoneRules: new FakeZoneRulesSource(),
        reviews: fakePriceReviewReader(listing([product("a", 2000)])),
        purchaseCosts: fakePurchaseCostReader([purchase("a", "line-a", 1200, freights)]),
        initialCountCosts: fakeInitialCountCostReader([]),
        batchCosts: fakeAssemblyBatchCostReader([]),
      },
      query,
    );

    expect(result.products[0]?.costReference).toEqual({
      lastCostCents: 1200,
      freightPerUnitCents: 300,
      totalCostCents: 1500,
      marginTenthsOfPercent: 250,
      costIncomplete: false,
    });
  });

  it("shows no cost reference for a product with no cost source", async () => {
    const result = await listPrices(
      {
        zoneRules: new FakeZoneRulesSource(),
        reviews: fakePriceReviewReader(listing([product("a", 2000)])),
        purchaseCosts: fakePurchaseCostReader([]),
        initialCountCosts: fakeInitialCountCostReader([]),
        batchCosts: fakeAssemblyBatchCostReader([]),
      },
      query,
    );

    expect(result.products[0]?.costReference).toBeNull();
  });

  it("shows the cost but no margin for a product with no price", async () => {
    const result = await listPrices(
      {
        zoneRules: new FakeZoneRulesSource(),
        reviews: fakePriceReviewReader(listing([product("a", null)])),
        purchaseCosts: fakePurchaseCostReader([purchase("a", "line-a", 1200)]),
        initialCountCosts: fakeInitialCountCostReader([]),
        batchCosts: fakeAssemblyBatchCostReader([]),
      },
      query,
    );

    expect(result.products[0]?.costReference).toEqual({
      lastCostCents: 1200,
      freightPerUnitCents: 0,
      totalCostCents: 1200,
      marginTenthsOfPercent: null,
      costIncomplete: false,
    });
  });

  it("picks the last cost among a product's sources", async () => {
    const result = await listPrices(
      {
        zoneRules: new FakeZoneRulesSource(),
        reviews: fakePriceReviewReader(listing([product("a", 2000)])),
        purchaseCosts: fakePurchaseCostReader([purchase("a", "line-1", 1200)]),
        initialCountCosts: fakeInitialCountCostReader([counted("a", 900)]),
        batchCosts: fakeAssemblyBatchCostReader([]),
      },
      query,
    );

    expect(result.products[0]?.costReference?.lastCostCents).toBe(900);
  });

  it("takes the most recent batch's cost as an assembled product's last cost and flags it incomplete", async () => {
    const result = await listPrices(
      {
        zoneRules: new FakeZoneRulesSource(),
        reviews: fakePriceReviewReader(listing([product("a", 2000), product("b", 500)])),
        purchaseCosts: fakePurchaseCostReader([purchase("a", "line-1", 1200)]),
        initialCountCosts: fakeInitialCountCostReader([counted("a", 900)]),
        batchCosts: fakeAssemblyBatchCostReader([assembled("a", 700, true), assembled("b", 300)]),
      },
      query,
    );

    expect(result.products.map(({ costReference }) => costReference)).toMatchObject([
      { lastCostCents: 700, costIncomplete: true },
      { lastCostCents: 300, costIncomplete: false },
    ]);
  });

  it("takes an initial count's cost for a product with no purchase", async () => {
    const result = await listPrices(
      {
        zoneRules: new FakeZoneRulesSource(),
        reviews: fakePriceReviewReader(listing([product("a", 2000), product("b", 500)])),
        purchaseCosts: fakePurchaseCostReader([purchase("b", "line-b", 250)]),
        initialCountCosts: fakeInitialCountCostReader([counted("a", 900)]),
        batchCosts: fakeAssemblyBatchCostReader([]),
      },
      query,
    );

    expect(result.products.map(({ costReference }) => costReference?.lastCostCents)).toEqual([
      900, 250,
    ]);
  });

  it("reads the purchase, initial-count and batch costs of the listed products at the query's branch", async () => {
    const purchaseCosts = fakePurchaseCostReader([]);
    const initialCountCosts = fakeInitialCountCostReader([]);
    const batchCosts = fakeAssemblyBatchCostReader([]);
    const reviews = fakePriceReviewReader(listing([product("a", 2000), product("b", 500)]));

    await listPrices(
      {
        zoneRules: new FakeZoneRulesSource(),
        reviews,
        purchaseCosts,
        initialCountCosts,
        batchCosts,
      },
      query,
    );

    expect(reviews.queries).toEqual([query]);
    expect(purchaseCosts.asked).toEqual([{ locationId: "location-1", productIds: ["a", "b"] }]);
    expect(initialCountCosts.asked).toEqual([{ locationId: "location-1", productIds: ["a", "b"] }]);
    expect(batchCosts.asked).toEqual([{ locationId: "location-1", productIds: ["a", "b"] }]);
  });
});
