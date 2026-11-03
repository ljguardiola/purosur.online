import { describe, expect, it } from "vitest";
import { marginTenthsOfPercent } from "./margin-over-price.js";

function whole(value: number) {
  return { numerator: BigInt(value), denominator: 1n };
}

describe("marginTenthsOfPercent", () => {
  it("is the margin over the price in tenths of a percent", () => {
    expect(marginTenthsOfPercent(whole(100), whole(75))).toBe(250);
  });

  it("is negative when the cost is above the price", () => {
    expect(marginTenthsOfPercent(whole(100), whole(120))).toBe(-200);
  });

  it("is zero when the cost equals the price", () => {
    expect(marginTenthsOfPercent(whole(100), whole(100))).toBe(0);
  });

  it("is a full hundred percent when the cost is zero", () => {
    expect(marginTenthsOfPercent(whole(100), whole(0))).toBe(1_000);
  });

  it("rounds half up to the tenth", () => {
    expect(marginTenthsOfPercent(whole(2_000), whole(1_999))).toBe(1);
    expect(marginTenthsOfPercent(whole(4_000), whole(3_998))).toBe(1);
    expect(marginTenthsOfPercent(whole(4_000), whole(3_999))).toBe(0);
    expect(marginTenthsOfPercent(whole(4_000), whole(4_001))).toBe(0);
    expect(marginTenthsOfPercent(whole(4_000), whole(4_002))).toBe(0);
    expect(marginTenthsOfPercent(whole(4_000), whole(4_003))).toBe(-1);
  });

  it("rounds a repeating margin to the nearest tenth", () => {
    expect(marginTenthsOfPercent(whole(1_100), whole(1_000))).toBe(91);
    expect(marginTenthsOfPercent(whole(300), whole(100))).toBe(667);
  });

  it("accepts fractional price and cost", () => {
    const price = { numerator: 3n, denominator: 2n };
    const cost = { numerator: 9n, denominator: 8n };

    expect(marginTenthsOfPercent(price, cost)).toBe(250);
  });

  it("has no margin without a price", () => {
    expect(marginTenthsOfPercent(whole(0), whole(50))).toBeNull();
    expect(marginTenthsOfPercent({ numerator: 0n, denominator: 7n }, whole(0))).toBeNull();
  });
});
