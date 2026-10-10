import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  firstOfflineNumberBlock,
  nextOfflineNumber,
  OFFLINE_NUMBER_BLOCK_SIZE,
  OFFLINE_NUMBER_BLOCK_STATUSES,
  type OfflineNumberBlockRange,
} from "./offline-number-block.js";

function contiguousBlocks(count: number): OfflineNumberBlockRange[] {
  return Array.from({ length: count }, (_, index) => ({
    firstNumber: index * 1000 + 1,
    lastNumber: (index + 1) * 1000,
  }));
}

describe("offline number blocks", () => {
  it("hold 1000 numbers each", () => {
    expect(OFFLINE_NUMBER_BLOCK_SIZE).toBe(1000);
  });

  it("start in use", () => {
    expect(OFFLINE_NUMBER_BLOCK_STATUSES).toEqual(["in_use"]);
  });
});

describe("firstOfflineNumberBlock", () => {
  it("holds the first 1000 numbers of the series, 1 to 1000", () => {
    expect(firstOfflineNumberBlock()).toEqual({ firstNumber: 1, lastNumber: 1000 });
  });
});

describe("nextOfflineNumber", () => {
  const blocks = contiguousBlocks(2);

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
          const held = contiguousBlocks(count);
          const next = nextOfflineNumber(held, lastUsed);
          if (next === null) {
            expect(lastUsed).toBeGreaterThanOrEqual(count * 1000);
          } else {
            expect(next).toBe(lastUsed + 1);
          }
        },
      ),
    );
  });
});
