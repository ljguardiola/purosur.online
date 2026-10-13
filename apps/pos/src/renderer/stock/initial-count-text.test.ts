import type { InitialCountLine } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import { countedText, linesText, summaryOf } from "./initial-count-text";

function line(overrides: Partial<InitialCountLine>): InitialCountLine {
  return {
    movement_id: "m1",
    product_id: "p1",
    product_name: "Yerba",
    sale_unit: "UNIT",
    counted: 1000,
    expires_on: null,
    ...overrides,
  };
}

describe("countedText", () => {
  it("writes the weight of a product sold by the kilo", () => {
    expect(countedText(line({ sale_unit: "KG", counted: 4400 }))).toBe("4,400 kg");
  });

  it("writes the whole units of a product sold by the unit", () => {
    expect(countedText(line({ sale_unit: "UNIT", counted: 24_000 }))).toBe("24 u");
  });

  it("groups the thousands of units", () => {
    expect(countedText(line({ sale_unit: "UNIT", counted: 1_200_000 }))).toBe("1.200 u");
  });
});

describe("linesText", () => {
  it("writes one line in the singular and any other count in the plural", () => {
    expect(linesText(0)).toBe("0 líneas");
    expect(linesText(1)).toBe("1 línea");
    expect(linesText(4)).toBe("4 líneas");
  });
});

describe("summaryOf", () => {
  it("counts the lines, the distinct products and the lines with and without an expiry", () => {
    expect(
      summaryOf([
        line({ movement_id: "m1", product_id: "a", expires_on: "2026-12-01" }),
        line({ movement_id: "m2", product_id: "a", expires_on: "2027-01-01" }),
        line({ movement_id: "m3", product_id: "b", expires_on: "2026-11-01" }),
        line({ movement_id: "m4", product_id: "c", expires_on: null }),
      ]),
    ).toEqual({ lines: 4, products: 3, withExpiry: 3, withoutExpiry: 1 });
  });

  it("is all zeros for no lines", () => {
    expect(summaryOf([])).toEqual({ lines: 0, products: 0, withExpiry: 0, withoutExpiry: 0 });
  });
});
