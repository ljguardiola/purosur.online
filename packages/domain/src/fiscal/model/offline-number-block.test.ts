import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  nextOfflineNumber,
  nextOfflineNumberBlock,
  OFFLINE_NUMBER_BLOCK_SIZE,
  OFFLINE_NUMBER_BLOCK_STATUSES,
  type OfflineNumberBlockRange,
} from "./offline-number-block.js";

function blocksAssigned(count: number): OfflineNumberBlockRange[] {
  const blocks: OfflineNumberBlockRange[] = [];
  let previous: OfflineNumberBlockRange | null = null;
  for (let index = 0; index < count; index += 1) {
    previous = nextOfflineNumberBlock(previous);
    blocks.push(previous);
  }
  return blocks;
}

describe("offline number blocks", () => {
  it("hold 1000 numbers each", () => {
    expect(OFFLINE_NUMBER_BLOCK_SIZE).toBe(1000);
  });

  it("start in use", () => {
    expect(OFFLINE_NUMBER_BLOCK_STATUSES).toEqual(["in_use"]);
  });
});

describe("nextOfflineNumberBlock", () => {
  it("starts the series at 1 when no block was ever assigned", () => {
    expect(nextOfflineNumberBlock(null)).toEqual({ firstNumber: 1, lastNumber: 1000 });
  });

  it("is the range right after the previous block", () => {
    expect(nextOfflineNumberBlock({ firstNumber: 1, lastNumber: 1000 })).toEqual({
      firstNumber: 1001,
      lastNumber: 2000,
    });
  });

  it("always holds the block size and starts right after the previous block, so blocks never overlap", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 200 }), (count) => {
        const blocks = blocksAssigned(count);
        expect(blocks[0]?.firstNumber).toBe(1);
        blocks.forEach((block, index) => {
          expect(block.lastNumber - block.firstNumber + 1).toBe(OFFLINE_NUMBER_BLOCK_SIZE);
          const previous = blocks[index - 1];
          if (previous !== undefined) {
            expect(block.firstNumber).toBe(previous.lastNumber + 1);
          }
        });
      }),
    );
  });
});

describe("nextOfflineNumber", () => {
  const blocks = blocksAssigned(2);

  it("is the first number of the first block when none was used", () => {
    expect(nextOfflineNumber(blocks, null)).toBe(1);
  });

  it("is the number right after the last one used", () => {
    expect(nextOfflineNumber(blocks, 41)).toBe(42);
  });

  it("moves to the first number of the next block when a block is used up", () => {
    expect(nextOfflineNumber(blocks, 1000)).toBe(1001);
  });

  it("is the last number of a block still having one", () => {
    expect(nextOfflineNumber(blocks, 999)).toBe(1000);
  });

  it("is nothing when every number of every block was used", () => {
    expect(nextOfflineNumber(blocks, 2000)).toBeNull();
  });

  it("is nothing when the register holds no block", () => {
    expect(nextOfflineNumber([], null)).toBeNull();
  });

  it("takes blocks in the order they were assigned", () => {
    const [first, second] = blocks;
    if (first === undefined || second === undefined) {
      throw new Error("two blocks were assigned");
    }
    expect(nextOfflineNumber([second, first], 1000)).toBe(1001);
    expect(nextOfflineNumber([second, first], null)).toBe(1001);
  });

  it("never returns a number at or below the last one used, and returns one the blocks hold", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 0, max: 6000 }),
        (count, lastUsed) => {
          const held = blocksAssigned(count);
          const next = nextOfflineNumber(held, lastUsed);
          if (next === null) {
            expect(lastUsed).toBeGreaterThanOrEqual(count * OFFLINE_NUMBER_BLOCK_SIZE);
          } else {
            expect(next).toBe(lastUsed + 1);
          }
        },
      ),
    );
  });
});
