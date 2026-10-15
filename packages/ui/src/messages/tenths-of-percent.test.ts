import { describe, expect, it } from "vitest";
import { formatSignedTenthsOfPercent, formatTenthsOfPercent } from "./tenths-of-percent";

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

describe("formatSignedTenthsOfPercent", () => {
  it("writes a rise with a plus sign", () => {
    expect(formatSignedTenthsOfPercent(57)).toBe("+ 5,7 %");
    expect(formatSignedTenthsOfPercent(1)).toBe("+ 0,1 %");
    expect(formatSignedTenthsOfPercent(1000)).toBe("+ 100,0 %");
  });

  it("writes a fall as the unsigned formatter does", () => {
    expect(formatSignedTenthsOfPercent(-32)).toBe("−3,2 %");
    expect(formatSignedTenthsOfPercent(-1000)).toBe("−100,0 %");
  });

  it("writes no change with no sign", () => {
    expect(formatSignedTenthsOfPercent(0)).toBe("0,0 %");
  });
});
