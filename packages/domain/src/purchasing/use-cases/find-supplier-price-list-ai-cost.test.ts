import { describe, expect, it } from "vitest";
import { findSupplierPriceListAiCost } from "./find-supplier-price-list-ai-cost.js";
import { FakeSupplierPriceListAiCostReader } from "./test-support/fake-ai-cost-readers.js";

describe("findSupplierPriceListAiCost", () => {
  it("answers not_found for a list that does not exist", async () => {
    const reader = new FakeSupplierPriceListAiCostReader();

    expect(
      await findSupplierPriceListAiCost({ reader }, { locationId: "branch-1", listId: "missing" }),
    ).toEqual({ kind: "not_found" });
  });

  it("answers not_found for a list of another branch", async () => {
    const reader = new FakeSupplierPriceListAiCostReader({
      "list-1": { locationId: "branch-2", calls: [{ purpose: "READING", costNanoUsd: 10 }] },
    });

    expect(
      await findSupplierPriceListAiCost({ reader }, { locationId: "branch-1", listId: "list-1" }),
    ).toEqual({ kind: "not_found" });
    expect(reader.reads).toEqual([{ locationId: "branch-1", listId: "list-1" }]);
  });

  it("answers the cost of the reading, of the proposals and of both", async () => {
    const reader = new FakeSupplierPriceListAiCostReader({
      "list-1": {
        locationId: "branch-1",
        calls: [
          { purpose: "READING", costNanoUsd: 1_000 },
          { purpose: "LINK_PROPOSAL", costNanoUsd: 30 },
          { purpose: "LINK_PROPOSAL", costNanoUsd: null },
        ],
      },
    });

    expect(
      await findSupplierPriceListAiCost({ reader }, { locationId: "branch-1", listId: "list-1" }),
    ).toEqual({
      kind: "found",
      cost: {
        reading: { costNanoUsd: 1_000, unpricedCalls: 0 },
        proposals: { costNanoUsd: 30, unpricedCalls: 1 },
        total: { costNanoUsd: 1_030, unpricedCalls: 1 },
      },
    });
  });

  it("answers a zero cost for a list that made no AI call", async () => {
    const reader = new FakeSupplierPriceListAiCostReader({
      "list-1": { locationId: "branch-1", calls: [] },
    });

    const outcome = await findSupplierPriceListAiCost(
      { reader },
      { locationId: "branch-1", listId: "list-1" },
    );

    expect(outcome).toEqual({
      kind: "found",
      cost: {
        reading: { costNanoUsd: 0, unpricedCalls: 0 },
        proposals: { costNanoUsd: 0, unpricedCalls: 0 },
        total: { costNanoUsd: 0, unpricedCalls: 0 },
      },
    });
  });
});
