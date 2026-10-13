import { describe, expect, it } from "vitest";
import { formatTenthsOfPercent } from "./tenths-of-percent";

describe("formatTenthsOfPercent", () => {
  it("writes tenths of a percent with one decimal and a comma", () => {
    expect(formatTenthsOfPercent(405)).toBe("40,5 %");
    expect(formatTenthsOfPercent(400)).toBe("40,0 %");
    expect(formatTenthsOfPercent(5)).toBe("0,5 %");
    expect(formatTenthsOfPercent(0)).toBe("0,0 %");
    expect(formatTenthsOfPercent(1000)).toBe("100,0 %");
  });

  it("writes a negative percentage with a minus sign", () => {
    expect(formatTenthsOfPercent(-32)).toBe("−3,2 %");
  });
});
