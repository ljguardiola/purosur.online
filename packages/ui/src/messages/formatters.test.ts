import { describe, expect, it } from "vitest";
import {
  formatCents,
  formatDate,
  formatMonthAndYear,
  formatMonthName,
  formatNumber,
  formatTimeAgo,
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

describe("formatCents", () => {
  it("writes an amount in cents as pesos with two decimals", () => {
    expect(formatCents(5_070_000)).toBe("$ 50.700,00");
    expect(formatCents(40_000)).toBe("$ 400,00");
    expect(formatCents(0)).toBe("$ 0,00");
  });

  it("groups thousands with a dot and keeps the cents after a comma", () => {
    expect(formatCents(750_050)).toBe("$ 7.500,50");
    expect(formatCents(1)).toBe("$ 0,01");
    expect(formatCents(2_147_483_647)).toBe("$ 21.474.836,47");
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

describe("formatTimeAgo", () => {
  const MINUTE = 60;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  it.each([
    [0, "hace un momento"],
    [1, "hace un momento"],
    [59, "hace un momento"],
    [MINUTE, "hace 1 minuto"],
    [5 * MINUTE, "hace 5 minutos"],
    [HOUR - 1, "hace 59 minutos"],
    [HOUR, "hace 1 hora"],
    [3 * HOUR, "hace 3 horas"],
    [DAY - 1, "hace 23 horas"],
    [DAY, "hace 1 día"],
    [2 * DAY, "hace 2 días"],
    [30 * DAY - 1, "hace 29 días"],
    [30 * DAY, "hace 1 mes"],
    [59 * DAY, "hace 1 mes"],
    [64 * DAY, "hace 2 meses"],
  ])("writes %i seconds as %s", (seconds, text) => {
    expect(formatTimeAgo(seconds)).toBe(text);
  });
});
