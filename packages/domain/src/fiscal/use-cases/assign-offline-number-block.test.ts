import { describe, expect, it } from "vitest";
import { assignFirstOfflineNumberBlock } from "./assign-offline-number-block.js";
import { FakeOfflineNumberBlocks } from "./test-support/fake-offline-number-blocks.js";

const input = {
  pointOfSaleNumber: 12,
  documentType: "factura_c",
  registerId: "register-1",
} as const;

function storeKnowing(
  lastAuthorized: number | null,
  blocks: ConstructorParameters<typeof FakeOfflineNumberBlocks>[0] = [],
  highestSynced: number | null = null,
) {
  return new FakeOfflineNumberBlocks(
    blocks,
    [],
    () => {},
    new Map(lastAuthorized === null ? [] : [[12, lastAuthorized]]),
    [],
    new Map(highestSynced === null ? [] : [[12, highestSynced]]),
  );
}

describe("assignFirstOfflineNumberBlock", () => {
  it("assigns the first block of the series, right after the number the tax authority last authorized, in use for the register", async () => {
    const store = storeKnowing(37);

    const outcome = await assignFirstOfflineNumberBlock(store, input);

    expect(outcome).toEqual({ kind: "assigned", range: { firstNumber: 38, lastNumber: 1037 } });
    expect(store.blocks).toEqual([
      {
        pointOfSaleNumber: 12,
        documentType: "factura_c",
        registerId: "register-1",
        range: { firstNumber: 38, lastNumber: 1037 },
        status: "in_use",
      },
    ]);
  });

  it("starts at 1 when the tax authority has authorized nothing in the series", async () => {
    const outcome = await assignFirstOfflineNumberBlock(storeKnowing(0), input);

    expect(outcome).toEqual({ kind: "assigned", range: { firstNumber: 1, lastNumber: 1000 } });
  });

  it("starts right after the highest synced number when it is above the tax authority's count", async () => {
    const store = storeKnowing(37, [], 240);

    const outcome = await assignFirstOfflineNumberBlock(store, input);

    expect(outcome).toEqual({ kind: "assigned", range: { firstNumber: 241, lastNumber: 1240 } });
  });

  it("starts right after the tax authority's count when it is above the highest synced number", async () => {
    const store = storeKnowing(300, [], 240);

    const outcome = await assignFirstOfflineNumberBlock(store, input);

    expect(outcome).toEqual({ kind: "assigned", range: { firstNumber: 301, lastNumber: 1300 } });
  });

  it("assigns a block even when the point of sale only has a used up one", async () => {
    const store = storeKnowing(
      37,
      [{ ...input, range: { firstNumber: 1, lastNumber: 1000 }, status: "used_up" }],
      1000,
    );

    const outcome = await assignFirstOfflineNumberBlock(store, input);

    expect(outcome).toEqual({ kind: "assigned", range: { firstNumber: 1001, lastNumber: 2000 } });
  });

  it("locks the point of sale's blocks before it reads or writes them", async () => {
    const store = storeKnowing(37);

    await assignFirstOfflineNumberBlock(store, input);

    expect(store.operations).toEqual([
      "lockOfflineNumberBlocks",
      "offlineNumberBlockInUse",
      "taxAuthorityLastAuthorized",
      "highestSyncedOfflineNumber",
      "recordOfflineNumberBlock",
    ]);
  });

  it("assigns no block and asks for the count to be read while the tax authority's count is unknown", async () => {
    const store = storeKnowing(null);

    const outcome = await assignFirstOfflineNumberBlock(store, input);

    expect(outcome).toEqual({ kind: "tax_authority_count_unknown" });
    expect(store.blocks).toEqual([]);
    expect(store.requiredTaxAuthorityCounts).toEqual([12]);
    expect(store.operations).toEqual([
      "lockOfflineNumberBlocks",
      "offlineNumberBlockInUse",
      "taxAuthorityLastAuthorized",
      "requireTaxAuthorityCount",
    ]);
  });

  it("assigns nothing when the point of sale already has a block, even for another register", async () => {
    const store = storeKnowing(37, [
      {
        ...input,
        registerId: "register-2",
        range: { firstNumber: 1, lastNumber: 1000 },
        status: "in_use",
      },
    ]);
    const before = structuredClone(store.blocks);

    const outcome = await assignFirstOfflineNumberBlock(store, input);

    expect(outcome).toEqual({ kind: "already_has_block" });
    expect(store.blocks).toEqual(before);
    expect(store.requiredTaxAuthorityCounts).toEqual([]);
  });

  it("does not ask for the count of a point of sale that already has a block", async () => {
    const store = storeKnowing(null, [
      { ...input, range: { firstNumber: 1, lastNumber: 1000 }, status: "in_use" },
    ]);

    await assignFirstOfflineNumberBlock(store, input);

    expect(store.operations).toEqual(["lockOfflineNumberBlocks", "offlineNumberBlockInUse"]);
  });

  it("is not stopped by a block of another point of sale or document type", async () => {
    const store = storeKnowing(37, [
      {
        ...input,
        pointOfSaleNumber: 13,
        range: { firstNumber: 1, lastNumber: 1000 },
        status: "in_use",
      },
    ]);

    const outcome = await assignFirstOfflineNumberBlock(store, input);

    expect(outcome).toEqual({ kind: "assigned", range: { firstNumber: 38, lastNumber: 1037 } });
  });
});
