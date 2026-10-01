import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { highestContiguousSeq } from "./contiguous-seq.js";

describe("highestContiguousSeq", () => {
  it("is 0 when nothing was received", () => {
    expect(highestContiguousSeq([])).toBe(0);
  });

  it("is 0 while the first seq is missing, however many are held", () => {
    expect(highestContiguousSeq([2, 3, 4])).toBe(0);
  });

  it("is the last seq of an unbroken run from 1", () => {
    expect(highestContiguousSeq([1, 2, 3])).toBe(3);
  });

  it("stops before the first hole", () => {
    expect(highestContiguousSeq([1, 2, 4, 5])).toBe(2);
  });

  it("does not depend on the order the seqs are read in", () => {
    expect(highestContiguousSeq([4, 2, 1])).toBe(2);
  });

  it("holds every seq up to the answer and lacks the one after it", () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.integer({ min: 1, max: 60 }), { maxLength: 60 }), (held) => {
        const highest = highestContiguousSeq(held);
        const heldSet = new Set(held);
        for (let seq = 1; seq <= highest; seq += 1) {
          expect(heldSet.has(seq)).toBe(true);
        }
        expect(heldSet.has(highest + 1)).toBe(false);
      }),
    );
  });
});
