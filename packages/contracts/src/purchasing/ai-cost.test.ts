import { describe, expect, it } from "vitest";
import { aiCostSchema, supplierPriceListAiCostSchema } from "./ai-cost.js";

describe("aiCostSchema", () => {
  const total = { costNanoUsd: 1_234_000, unpricedCalls: 0 };
  const cost = { reading: total, proposals: { costNanoUsd: 0, unpricedCalls: 2 }, total };

  it("accepts the cost of the reading, of the proposals and of both", () => {
    expect(aiCostSchema.parse(cost)).toEqual(cost);
  });

  it.each([
    ["no reading", { reading: undefined }],
    ["no proposals", { proposals: undefined }],
    ["no total", { total: undefined }],
    ["a cost without nanodollars", { reading: { unpricedCalls: 0 } }],
    ["a cost without unpriced calls", { reading: { costNanoUsd: 1 } }],
    ["a negative cost", { reading: { costNanoUsd: -1, unpricedCalls: 0 } }],
    ["a cost with decimals", { reading: { costNanoUsd: 1.5, unpricedCalls: 0 } }],
    ["a negative count of unpriced calls", { reading: { costNanoUsd: 1, unpricedCalls: -1 } }],
    [
      "a count of unpriced calls with decimals",
      { reading: { costNanoUsd: 1, unpricedCalls: 0.5 } },
    ],
  ])("refuses %s", (_name, change) => {
    expect(aiCostSchema.safeParse({ ...cost, ...change }).success).toBe(false);
  });
});

describe("supplierPriceListAiCostSchema", () => {
  const total = { costNanoUsd: 1_234_000, unpricedCalls: 0 };
  const cost = { reading: total, proposals: total, total, recordedFromStart: false };

  it("accepts a list's cost and whether its calls were recorded from the start", () => {
    expect(supplierPriceListAiCostSchema.parse(cost)).toEqual(cost);
  });

  it.each([
    ["no mark of the calls recorded from the start", { recordedFromStart: undefined }],
    ["a mark that is not a boolean", { recordedFromStart: "false" }],
    ["a cost without its reading", { reading: undefined }],
  ])("refuses %s", (_name, change) => {
    expect(supplierPriceListAiCostSchema.safeParse({ ...cost, ...change }).success).toBe(false);
  });
});
