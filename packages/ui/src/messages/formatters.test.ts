import { describe, expect, it } from "vitest";
import { formatDate, formatNumber, plural } from "./formatters";

describe("plural", () => {
  it("selects the form Argentine Spanish plural rules choose", () => {
    expect(plural(1, { other: "artículos", one: "artículo" })).toBe("artículo");
    expect(plural(2, { other: "artículos", one: "artículo" })).toBe("artículos");
  });

  it("falls back to the other form when the selected form isn't given", () => {
    expect(plural(1, { other: "artículos" })).toBe("artículos");
  });
});

describe("formatNumber", () => {
  it("formats a number the way it reads in Argentina", () => {
    expect(formatNumber(1234.5)).toBe("1.234,5");
  });

  it("passes formatting options through to Intl.NumberFormat", () => {
    expect(formatNumber(1234.5, { minimumFractionDigits: 2 })).toBe("1.234,50");
  });
});

describe("formatDate", () => {
  it("formats a date the way it reads in Argentina", () => {
    expect(formatDate(new Date(2026, 0, 5))).toBe("5/1/2026");
  });

  it("passes formatting options through to Intl.DateTimeFormat", () => {
    expect(formatDate(new Date(2026, 0, 5), { month: "long" })).toBe("enero");
  });
});
