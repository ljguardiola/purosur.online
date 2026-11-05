import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { mayBeSplitFromLot } from "./lot-split.js";

describe("mayBeSplitFromLot", () => {
  it.each([
    [2_000, 1_000, true],
    [2_000, 1_999, true],
    [2_000, 2_000, false],
    [2_000, 2_001, false],
    [2_000, 0, false],
    [2_000, -1_000, false],
    [2_000, 1_000.5, false],
    [0, 1_000, false],
    [-3_000, 1_000, false],
  ])("a lot with %i left may give up %i: %s", (remaining, quantity, may) => {
    expect(mayBeSplitFromLot({ remaining }, quantity)).toBe(may);
  });

  it("allows exactly the whole numbers from one up to one less than what is left", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -10, max: 100 }),
        fc.integer({ min: -10, max: 100 }),
        (remaining, quantity) => {
          expect(mayBeSplitFromLot({ remaining }, quantity)).toBe(
            quantity >= 1 && quantity < remaining,
          );
        },
      ),
    );
  });
});
