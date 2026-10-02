import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { cashCountDifference } from "./cash-count.js";

describe("cashCountDifference", () => {
  it("is zero when the count matches the expected cash", () => {
    expect(cashCountDifference(14_000, 14_000)).toBe(0);
  });

  it("is positive when more cash was counted than expected", () => {
    expect(cashCountDifference(14_500, 14_000)).toBe(500);
  });

  it("is negative when less cash was counted than expected", () => {
    expect(cashCountDifference(13_000, 14_000)).toBe(-1_000);
  });

  it("is what was counted minus what was expected for any amounts", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (counted, expected) => {
        expect(cashCountDifference(counted, expected)).toBe(counted - expected);
      }),
    );
  });
});
