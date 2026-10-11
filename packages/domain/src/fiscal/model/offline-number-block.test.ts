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
  it.each([
    [0, { firstNumber: 1, lastNumber: 1000 }],
    [37, { firstNumber: 38, lastNumber: 1037 }],
    [1000, { firstNumber: 1001, lastNumber: 2000 }],
  ])("starts right after the %i numbers the tax authority has authorized", (authorized, block) => {
    expect(firstOfflineNumberBlock(authorized)).toEqual(block);
  });
});

describe("nextOfflineNumber", () => {
  const blocks = contiguousBlocks(2);

  function next(
    localLastUsed: number | null,
    taxAuthorityLastAuthorized: number | null = 0,
    held: readonly OfflineNumberBlockRange[] = blocks,
  ): number | null {
    return nextOfflineNumber({
      blocksInAssignmentOrder: held,
      localLastUsed,
      taxAuthorityLastAuthorized,
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
