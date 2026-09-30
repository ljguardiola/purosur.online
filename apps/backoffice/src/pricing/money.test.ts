import { describe, expect, it } from "vitest";
import { formatCents, MAX_UNIT_PRICE_CENTS } from "./money";

describe("formatCents", () => {
  it("formats cents as pesos with a dot for thousands and two decimals after a comma", () => {
    expect(formatCents(750050)).toBe("$ 7.500,50");
    expect(formatCents(1)).toBe("$ 0,01");
    expect(formatCents(MAX_UNIT_PRICE_CENTS)).toBe("$ 21.474.836,47");
  });
});
