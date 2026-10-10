import { describe, expect, it } from "vitest";
import {
  assignFirstOfflineNumberBlock,
  assignOfflineNumberBlock,
} from "./assign-offline-number-block.js";
import { FakeOfflineNumberBlocks } from "./test-support/fake-offline-number-blocks.js";

const input = {
  pointOfSaleNumber: 12,
  documentType: "factura_c",
  registerId: "register-1",
} as const;

describe("assignOfflineNumberBlock", () => {
  it("assigns the first block of the series, 1 to 1000, in use for the register, when none was assigned", async () => {
    const store = new FakeOfflineNumberBlocks();

    const outcome = await assignOfflineNumberBlock(store, input);

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

  it("assigns the range right after the last block handed out, never overlapping it", async () => {
    const store = new FakeOfflineNumberBlocks();

    await assignOfflineNumberBlock(store, input);
    const second = await assignOfflineNumberBlock(store, input);

    expect(second).toEqual({ kind: "assigned", range: { firstNumber: 1001, lastNumber: 2000 } });
    expect(store.blocks.map((block) => block.range)).toEqual([
      { firstNumber: 1, lastNumber: 1000 },
      { firstNumber: 1001, lastNumber: 2000 },
    ]);
  });

  it("numbers each point of sale and document type on its own", async () => {
    const store = new FakeOfflineNumberBlocks();
    await assignOfflineNumberBlock(store, input);

    const other = await assignOfflineNumberBlock(store, { ...input, pointOfSaleNumber: 13 });

    expect(other).toEqual({ kind: "assigned", range: { firstNumber: 1, lastNumber: 1000 } });
  });

  it("locks the point of sale's blocks before it reads or writes them", async () => {
    const store = new FakeOfflineNumberBlocks();

    await assignOfflineNumberBlock(store, input);

    expect(store.operations).toEqual([
      "lockOfflineNumberBlocks",
      "lastOfflineNumberBlock",
      "recordOfflineNumberBlock",
    ]);
  });
});

describe("assignFirstOfflineNumberBlock", () => {
  it("assigns the first block when the point of sale has none in use", async () => {
    const store = new FakeOfflineNumberBlocks();

    const outcome = await assignFirstOfflineNumberBlock(store, input);

    expect(outcome).toEqual({ kind: "assigned", range: { firstNumber: 1, lastNumber: 1000 } });
    expect(store.operations).toEqual([
      "lockOfflineNumberBlocks",
      "hasOfflineNumberBlockInUse",
      "lastOfflineNumberBlock",
      "recordOfflineNumberBlock",
    ]);
  });

  it("assigns nothing when the point of sale already has a block in use, even for another register", async () => {
    const store = new FakeOfflineNumberBlocks();
    await assignOfflineNumberBlock(store, { ...input, registerId: "register-2" });
    const before = structuredClone(store.blocks);

    const outcome = await assignFirstOfflineNumberBlock(store, input);

    expect(outcome).toEqual({ kind: "already_has_block" });
    expect(store.blocks).toEqual(before);
  });

  it("is not stopped by a block of another point of sale or document type", async () => {
    const store = new FakeOfflineNumberBlocks();
    await assignOfflineNumberBlock(store, { ...input, pointOfSaleNumber: 13 });

    const outcome = await assignFirstOfflineNumberBlock(store, input);

    expect(outcome).toEqual({ kind: "assigned", range: { firstNumber: 1, lastNumber: 1000 } });
  });
});
