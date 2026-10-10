import { describe, expect, it } from "vitest";
import { assignFirstOfflineNumberBlock } from "./assign-offline-number-block.js";
import { FakeOfflineNumberBlocks } from "./test-support/fake-offline-number-blocks.js";

const input = {
  pointOfSaleNumber: 12,
  documentType: "factura_c",
  registerId: "register-1",
} as const;

describe("assignFirstOfflineNumberBlock", () => {
  it("assigns the first block of the series, 1 to 1000, in use for the register, when the point of sale has none", async () => {
    const store = new FakeOfflineNumberBlocks();

    const outcome = await assignFirstOfflineNumberBlock(store, input);

    expect(outcome).toEqual({ kind: "assigned", range: { firstNumber: 1, lastNumber: 1000 } });
    expect(store.blocks).toEqual([
      {
        pointOfSaleNumber: 12,
        documentType: "factura_c",
        registerId: "register-1",
        range: { firstNumber: 1, lastNumber: 1000 },
        status: "in_use",
      },
    ]);
  });

  it("locks the point of sale's blocks before it reads or writes them", async () => {
    const store = new FakeOfflineNumberBlocks();

    await assignFirstOfflineNumberBlock(store, input);

    expect(store.operations).toEqual([
      "lockOfflineNumberBlocks",
      "hasOfflineNumberBlock",
      "recordOfflineNumberBlock",
    ]);
  });

  it("assigns nothing when the point of sale already has a block, even for another register", async () => {
    const store = new FakeOfflineNumberBlocks([
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
  });

  it("is not stopped by a block of another point of sale or document type", async () => {
    const store = new FakeOfflineNumberBlocks([
      {
        ...input,
        pointOfSaleNumber: 13,
        range: { firstNumber: 1, lastNumber: 1000 },
        status: "in_use",
      },
    ]);

    const outcome = await assignFirstOfflineNumberBlock(store, input);

    expect(outcome).toEqual({ kind: "assigned", range: { firstNumber: 1, lastNumber: 1000 } });
  });
});
