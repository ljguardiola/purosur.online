import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  firstOfflineNumberBlock,
  isOfflineNumberBlockUsedUp,
  lastUsedOfflineNumber,
  nextOfflineNumber,
  nextOfflineNumberBlock,
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

  it("are in use until their numbers are used up", () => {
    expect(OFFLINE_NUMBER_BLOCK_STATUSES).toEqual(["in_use", "used_up"]);
  });
});

describe("firstOfflineNumberBlock", () => {
  it.each([
    [0, { firstNumber: 1, lastNumber: 1000 }],
    [37, { firstNumber: 38, lastNumber: 1037 }],
    [1000, { firstNumber: 1001, lastNumber: 2000 }],
  ])("starts right after the last used number %i", (lastUsed, block) => {
    expect(firstOfflineNumberBlock(lastUsed)).toEqual(block);
  });
});

describe("lastUsedOfflineNumber", () => {
  it.each([
    [40, null, 40],
    [40, 25, 40],
    [40, 75, 75],
    [0, 0, 0],
    [0, 3, 3],
  ])("of a count of %i and a highest synced number of %s is %i", (count, synced, expected) => {
    expect(lastUsedOfflineNumber(count, synced)).toBe(expected);
  });
});

describe("nextOfflineNumberBlock", () => {
  it("continues right after the current block", () => {
    expect(nextOfflineNumberBlock({ firstNumber: 38, lastNumber: 1037 })).toEqual({
      firstNumber: 1038,
      lastNumber: 2037,
    });
  });
});

describe("isOfflineNumberBlockUsedUp", () => {
  const block = { firstNumber: 1, lastNumber: 1000 };

  it.each([
    [null, false],
    [0, false],
    [999, false],
    [1000, true],
    [1500, true],
  ])("is decided for a highest synced number of %s", (synced, expected) => {
    expect(isOfflineNumberBlockUsedUp(block, synced)).toBe(expected);
  });
});

describe("nextOfflineNumber", () => {
  const blocks = contiguousBlocks(2);

  function next(
    localLastUsed: number | null,
    taxAuthorityLastAuthorized: number | null = 0,
    held: readonly OfflineNumberBlockRange[] = blocks,
    highestSyncedNumber: number | null = null,
  ): number | null {
    return nextOfflineNumber({
      blocksInAssignmentOrder: held,
      localLastUsed,
      taxAuthorityLastAuthorized,
      highestSyncedNumber,
    });
  }

  it("is the first number of the first block when none was used", () => {
    expect(next(null)).toBe(1);
  });

  it("is the number right after the last one used", () => {
    expect(next(41)).toBe(42);
  });

  it("moves to the first number of the next block when a block is used up", () => {
    expect(next(1000)).toBe(1001);
  });

  it("is the last number of a block still having one", () => {
    expect(next(999)).toBe(1000);
  });

  it("is nothing when every number of every block was used", () => {
    expect(next(2000)).toBeNull();
  });

  it("is nothing when the register holds no block", () => {
    expect(next(null, 0, [])).toBeNull();
  });

  it("takes blocks in the order they were assigned", () => {
    const [first, second] = blocks;
    if (first === undefined || second === undefined) {
      throw new Error("two blocks were assigned");
    }
    expect(next(1000, 0, [second, first])).toBe(1001);
    expect(next(null, 0, [second, first])).toBe(1001);
  });

  it("is nothing while the tax authority's last authorized number is unknown", () => {
    expect(next(null, null)).toBeNull();
    expect(next(41, null)).toBeNull();
  });

  it("continues after the tax authority's last authorized number when no local number was used", () => {
    expect(next(null, 41)).toBe(42);
  });

  it("continues after the tax authority's last authorized number when it is above the local one", () => {
    expect(next(10, 41)).toBe(42);
  });

  it("continues after the local number when it is above the tax authority's", () => {
    expect(next(41, 10)).toBe(42);
  });

  it("continues after the highest synced number when it is above the count and the local one", () => {
    expect(next(10, 41, blocks, 90)).toBe(91);
    expect(next(null, 0, blocks, 90)).toBe(91);
  });

  it("ignores a highest synced number below the count and the local one", () => {
    expect(next(60, 41, blocks, 30)).toBe(61);
  });

  it("is nothing while the count is unknown, whatever was synced", () => {
    expect(next(null, null, blocks, 90)).toBeNull();
  });

  it("is nothing when the synced numbers already use every block", () => {
    expect(next(null, 0, blocks, 2000)).toBeNull();
  });

  it("is nothing when the tax authority already holds every number of every block", () => {
    expect(next(null, 2000)).toBeNull();
  });

  it("never returns a number at or below one already used or authorized, and returns one the blocks hold", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.option(fc.integer({ min: 0, max: 6000 })),
        fc.integer({ min: 0, max: 6000 }),
        (count, localLastUsed, taxAuthorityLastAuthorized) => {
          const held = contiguousBlocks(count);
          const result = next(localLastUsed, taxAuthorityLastAuthorized, held);
          const highestUsed = Math.max(localLastUsed ?? 0, taxAuthorityLastAuthorized);
          if (result === null) {
            expect(highestUsed).toBeGreaterThanOrEqual(count * 1000);
          } else {
            expect(result).toBe(highestUsed + 1);
          }
        },
      ),
    );
  });
});
