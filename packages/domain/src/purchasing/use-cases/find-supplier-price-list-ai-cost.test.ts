import { describe, expect, it } from "vitest";
import { findSupplierPriceListAiCost } from "./find-supplier-price-list-ai-cost.js";
import { FakeSupplierPriceListAiCostReader } from "./test-support/fake-ai-cost-readers.js";

describe("findSupplierPriceListAiCost", () => {
  it("answers not_found for a list that does not exist", async () => {
    const reader = new FakeSupplierPriceListAiCostReader();

    expect(await findSupplierPriceListAiCost({ reader }, { listId: "missing" })).toEqual({
      kind: "not_found",
    });
    expect(reader.reads).toEqual(["missing"]);
  });

  it("answers the cost of the reading, of the proposals and of both", async () => {
    const reader = new FakeSupplierPriceListAiCostReader({
      "list-1": {
        recordedFromStart: true,
        calls: [
          { purpose: "READING", costNanoUsd: 1_000 },
          { purpose: "LINK_PROPOSAL", costNanoUsd: 30 },
          { purpose: "LINK_PROPOSAL", costNanoUsd: null },
        ],
      },
    });

    expect(await findSupplierPriceListAiCost({ reader }, { listId: "list-1" })).toEqual({
      kind: "found",
      cost: {
        reading: { costNanoUsd: 1_000, unpricedCalls: 0 },
        proposals: { costNanoUsd: 30, unpricedCalls: 1 },
        total: { costNanoUsd: 1_030, unpricedCalls: 1 },
      },
      recordedFromStart: true,
    });
  });

  it("answers a zero cost for a list that made no AI call", async () => {
    const reader = new FakeSupplierPriceListAiCostReader({
      "list-1": { recordedFromStart: true, calls: [] },
    });

    expect(await findSupplierPriceListAiCost({ reader }, { listId: "list-1" })).toEqual({
      kind: "found",
      cost: {
        reading: { costNanoUsd: 0, unpricedCalls: 0 },
        proposals: { costNanoUsd: 0, unpricedCalls: 0 },
        total: { costNanoUsd: 0, unpricedCalls: 0 },
      },
      recordedFromStart: true,
    });
  });

  it("says the cost of a list whose AI calls began before they were recorded misses them", async () => {
    const reader = new FakeSupplierPriceListAiCostReader({
      "list-1": {
        recordedFromStart: false,
        calls: [{ purpose: "LINK_PROPOSAL", costNanoUsd: 30 }],
      },
    });

    expect(await findSupplierPriceListAiCost({ reader }, { listId: "list-1" })).toMatchObject({
      kind: "found",
      cost: { total: { costNanoUsd: 30, unpricedCalls: 0 } },
      recordedFromStart: false,
    });
  });
});
