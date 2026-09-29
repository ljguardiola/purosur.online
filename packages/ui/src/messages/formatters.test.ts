import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatMonthAndYear,
  formatMonthName,
  formatNumber,
  plural,
} from "./formatters";

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

describe("formatMonthName", () => {
  it("writes the month's full name capitalised", () => {
    expect(formatMonthName(1)).toBe("Enero");
    expect(formatMonthName(9)).toBe("Septiembre");
    expect(formatMonthName(12)).toBe("Diciembre");
  });
});

describe("formatMonthAndYear", () => {
  it("writes the capitalised month and the year with no connector", () => {
    expect(formatMonthAndYear(2026, 9)).toBe("Septiembre 2026");
  });

  it("writes a year of five digits without a thousands separator", () => {
    expect(formatMonthAndYear(10000, 1)).toBe("Enero 10000");
  });
});
