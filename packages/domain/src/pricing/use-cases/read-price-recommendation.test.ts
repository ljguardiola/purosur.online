import { describe, expect, it } from "vitest";
import { FakeZoneRulesSource } from "../../shared/test-support/fake-zone-rules-source.js";
import type { AssemblyBatchCost } from "./assembly-batch-cost-reader.js";
import type { PurchaseLineCost } from "./purchase-cost-reader.js";
import { readPriceRecommendation } from "./read-price-recommendation.js";
import { fakeActiveProductReader } from "./test-support/fake-active-product-reader.js";
import { fakeAssemblyBatchCostReader } from "./test-support/fake-assembly-batch-cost-reader.js";
import { fakeCurrentPriceReader } from "./test-support/fake-current-price-reader.js";
import { fakeInitialCountCostReader } from "./test-support/fake-initial-count-cost-reader.js";
import { fakePurchaseCostReader } from "./test-support/fake-purchase-cost-reader.js";

const MIX = "mix";
const ALMONDS = "almonds";
const RAISINS = "raisins";
const MIX_PRICE = {
  id: "price-mix",
  unitPrice: 1_500_000,
  validFrom: new Date("2026-02-01T00:00:00Z"),
};
const components = [
  { componentProductId: ALMONDS, quantityPerOutputUnit: 600 },
  { componentProductId: RAISINS, quantityPerOutputUnit: 400 },
];

function batch(
  batchId: string,
  assembledAt: string,
  totalCents: number,
  costIncomplete = false,
): AssemblyBatchCost {
  return {
    productId: MIX,
    batchId,
    assembledAt: new Date(assembledAt),
    cost: { totalCents, quantity: 1000 },
    costIncomplete,
  };
}

function ports({
  prices = new Map([
    [MIX, MIX_PRICE],
    [ALMONDS, { id: "p1", unitPrice: 2_000_000, validFrom: new Date("2026-01-01T00:00:00Z") }],
    [RAISINS, { id: "p2", unitPrice: 1_000_000, validFrom: new Date("2026-01-01T00:00:00Z") }],
  ]),
  batches = [] as AssemblyBatchCost[],
  active = [MIX],
} = {}) {
  const purchase: PurchaseLineCost = {
    productId: MIX,
    lineId: "line",
    purchasedOn: "2026-03-01",
    recordedAt: new Date("2026-03-01T10:00:00Z"),
    cost: { totalCents: 1, quantity: 1000 },
    freights: [],
  };
  return {
    products: fakeActiveProductReader(active),
    currentPrices: fakeCurrentPriceReader(prices),
    zoneRules: new FakeZoneRulesSource(),
    purchaseCosts: fakePurchaseCostReader([purchase]),
    initialCountCosts: fakeInitialCountCostReader([]),
    batchCosts: fakeAssemblyBatchCostReader(batches),
  };
}

const input = { locationId: "location-1", productId: MIX, components, unitPrice: 1_600_000 };

describe("readPriceRecommendation", () => {
  it("answers not found for a product that is not active", async () => {
    const outcome = await readPriceRecommendation(ports({ active: [] }), input);

    expect(outcome).toEqual({ kind: "not_found" });
  });

  it("recommends the price from the components' current prices beside the product's current price", async () => {
    const outcome = await readPriceRecommendation(ports(), input);

    expect(outcome).toMatchObject({
      kind: "read",
      currentPrice: MIX_PRICE,
      recommendation: { kind: "recommended", unitPrice: 1_600_000 },
    });
  });

  it("rounds the recommendation half up to cents", async () => {
    const prices = new Map([
      [ALMONDS, { id: "p1", unitPrice: 1, validFrom: new Date("2026-01-01T00:00:00Z") }],
    ]);

    const outcome = await readPriceRecommendation(ports({ prices }), {
      ...input,
      components: [{ componentProductId: ALMONDS, quantityPerOutputUnit: 500 }],
    });

    expect(outcome).toMatchObject({ recommendation: { kind: "recommended", unitPrice: 1 } });
  });

  it("names the components without a current price instead of recommending", async () => {
    const prices = new Map([[MIX, MIX_PRICE]]);

    const outcome = await readPriceRecommendation(ports({ prices }), input);

    expect(outcome).toMatchObject({
      recommendation: { kind: "missing_prices", componentProductIds: [ALMONDS, RAISINS] },
    });
  });

  it("answers no current price for a product that has none", async () => {
    const prices = new Map([
      [ALMONDS, { id: "p1", unitPrice: 2_000_000, validFrom: new Date("2026-01-01T00:00:00Z") }],
      [RAISINS, { id: "p2", unitPrice: 1_000_000, validFrom: new Date("2026-01-01T00:00:00Z") }],
    ]);

    const outcome = await readPriceRecommendation(ports({ prices }), input);

    expect(outcome).toMatchObject({ currentPrice: null });
  });

  it("shows no batch cost when the product has no batch", async () => {
    const outcome = await readPriceRecommendation(ports(), input);

    expect(outcome).toMatchObject({ batchCost: { kind: "none" } });
  });

  it("ignores the product's purchase costs and uses only its batch", async () => {
    const outcome = await readPriceRecommendation(
      ports({ batches: [batch("b1", "2026-03-08T10:00:00Z", 1_200_000)] }),
      input,
    );

    expect(outcome).toMatchObject({
      batchCost: { kind: "known", unitCostCents: 1_200_000, marginTenthsOfPercent: 250 },
    });
  });

  it("costs the product by its latest batch", async () => {
    const outcome = await readPriceRecommendation(
      ports({
        batches: [
          batch("b1", "2026-03-08T10:00:00Z", 1_200_000),
          batch("b2", "2026-03-10T10:00:00Z", 800_000),
          batch("b0", "2026-03-01T10:00:00Z", 1_500_000),
        ],
      }),
      input,
    );

    expect(outcome).toMatchObject({ batchCost: { kind: "known", unitCostCents: 800_000 } });
  });

  it("shows no margin when the latest batch's cost is incomplete", async () => {
    const outcome = await readPriceRecommendation(
      ports({ batches: [batch("b1", "2026-03-08T10:00:00Z", 1_200_000, true)] }),
      input,
    );

    expect(outcome).toMatchObject({ batchCost: { kind: "incomplete" } });
  });

  it("gives the batch cost without a margin when no price is proposed", async () => {
    const outcome = await readPriceRecommendation(
      ports({ batches: [batch("b1", "2026-03-08T10:00:00Z", 1_200_000)] }),
      { ...input, unitPrice: null },
    );

    expect(outcome).toMatchObject({
      batchCost: { kind: "known", unitCostCents: 1_200_000, marginTenthsOfPercent: null },
    });
  });
});
