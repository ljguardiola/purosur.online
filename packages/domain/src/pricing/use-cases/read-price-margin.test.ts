import { describe, expect, it } from "vitest";
import type { PurchaseLineCost } from "./purchase-cost-reader.js";
import { readPriceMargin } from "./read-price-margin.js";
import { fakeActiveProductReader } from "./test-support/fake-active-product-reader.js";
import { fakeInitialCountCostReader } from "./test-support/fake-initial-count-cost-reader.js";
import { fakePurchaseCostReader } from "./test-support/fake-purchase-cost-reader.js";

const purchase: PurchaseLineCost = {
  productId: "a",
  lineId: "line-a",
  purchasedOn: "2026-03-01",
  recordedAt: new Date("2026-03-01T10:00:00Z"),
  cost: { totalCents: 1200, quantity: 1000 },
};

const input = { locationId: "location-1", productId: "a", unitPrice: 2000 };

function ports(purchases: PurchaseLineCost[], activeProductIds: string[] = ["a"]) {
  return {
    products: fakeActiveProductReader(activeProductIds),
    purchaseCosts: fakePurchaseCostReader(purchases),
    initialCountCosts: fakeInitialCountCostReader([
      {
        productId: "a",
        countedAt: new Date("2026-02-01T10:00:00Z"),
        withdrawn: false,
        costIncomplete: false,
        cost: { totalCents: 900, quantity: 1000 },
      },
    ]),
  };
}

describe("readPriceMargin", () => {
  it("gives the cost reference with the margin of the typed price", async () => {
    const outcome = await readPriceMargin(ports([purchase]), input);

    expect(outcome).toEqual({
      kind: "read",
      costReference: {
        lastCostCents: 1200,
        freightPerUnitCents: 0,
        totalCostCents: 1200,
        marginTenthsOfPercent: 400,
      },
    });
  });

  it("follows the typed price, not the current one", async () => {
    const outcome = await readPriceMargin(ports([purchase]), { ...input, unitPrice: 1000 });

    expect(outcome).toMatchObject({ costReference: { marginTenthsOfPercent: -200 } });
  });

  it("takes the initial count's cost of a product with no purchase", async () => {
    const outcome = await readPriceMargin(ports([]), input);

    expect(outcome).toMatchObject({ kind: "read", costReference: { lastCostCents: 900 } });
  });

  it("reads the costs of the product only, at the input's branch", async () => {
    const read = ports([purchase]);

    await readPriceMargin(read, input);

    expect(read.purchaseCosts.asked).toEqual([{ locationId: "location-1", productIds: ["a"] }]);
    expect(read.initialCountCosts.asked).toEqual([{ locationId: "location-1", productIds: ["a"] }]);
  });

  it("gives no cost reference for a product with no cost source", async () => {
    const outcome = await readPriceMargin(
      { ...ports([]), initialCountCosts: fakeInitialCountCostReader([]) },
      input,
    );

    expect(outcome).toEqual({ kind: "read", costReference: null });
  });

  it("reports a product that is not active as not found, before reading its costs", async () => {
    const read = ports([purchase], []);

    const outcome = await readPriceMargin(read, input);

    expect(outcome).toEqual({ kind: "not_found" });
    expect(read.purchaseCosts.asked).toEqual([]);
    expect(read.initialCountCosts.asked).toEqual([]);
  });
});
