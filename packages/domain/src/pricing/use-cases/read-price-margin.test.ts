import { describe, expect, it } from "vitest";
import type { CostSource } from "../model/price-cost-reference.js";
import { readPriceMargin } from "./read-price-margin.js";
import { fakePriceCostReader } from "./test-support/fake-price-cost-reader.js";

const purchase: CostSource = {
  kind: "purchase_line",
  lineId: "line-a",
  purchasedOn: "2026-03-01",
  recordedAt: new Date("2026-03-01T10:00:00Z"),
  cost: { totalCents: 1200, quantity: 1000 },
};

const input = { locationId: "location-1", productId: "a", unitPrice: 2000 };

describe("readPriceMargin", () => {
  it("gives the cost reference with the margin of the typed price", async () => {
    const outcome = await readPriceMargin(
      { costs: fakePriceCostReader([{ productId: "a", source: purchase }], ["a"]) },
      input,
    );

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
    const outcome = await readPriceMargin(
      { costs: fakePriceCostReader([{ productId: "a", source: purchase }], ["a"]) },
      { ...input, unitPrice: 1000 },
    );

    expect(outcome).toMatchObject({ costReference: { marginTenthsOfPercent: -200 } });
  });

  it("gives no cost reference for a product with no cost source", async () => {
    const outcome = await readPriceMargin({ costs: fakePriceCostReader([], ["a"]) }, input);

    expect(outcome).toEqual({ kind: "read", costReference: null });
  });

  it("reports a product that is not active as not found", async () => {
    const outcome = await readPriceMargin(
      { costs: fakePriceCostReader([{ productId: "a", source: purchase }], []) },
      input,
    );

    expect(outcome).toEqual({ kind: "not_found" });
  });
});
