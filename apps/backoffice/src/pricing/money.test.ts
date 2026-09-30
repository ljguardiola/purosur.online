import { describe, expect, it } from "vitest";
import { formatCentsWithUnit } from "./money";

describe("formatCentsWithUnit", () => {
  it("writes the amount alone for a product sold by unit", () => {
    expect(formatCentsWithUnit(750050, "UNIT")).toBe("$ 7.500,50");
  });

  it("writes the amount per kilogram for a product sold by weight", () => {
    expect(formatCentsWithUnit(750050, "KG")).toBe("$ 7.500,50 / kg");
  });
});
