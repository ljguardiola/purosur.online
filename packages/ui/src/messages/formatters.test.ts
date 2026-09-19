import { describe, expect, it } from "vitest";
import { createFormatters } from "./formatters";

describe("createFormatters", () => {
  it("selects the plural form the locale's plural rules choose", () => {
    const { plural } = createFormatters("es-AR");

    expect(plural(1, { other: "artículos", one: "artículo" })).toBe("artículo");
    expect(plural(2, { other: "artículos", one: "artículo" })).toBe("artículos");
  });

  it("falls back to the other form when the selected form isn't given", () => {
    const { plural } = createFormatters("es-AR");

    expect(plural(1, { other: "artículos" })).toBe("artículos");
  });

  it("formats a number using the locale's conventions", () => {
    const { number } = createFormatters("es-AR");

    expect(number(1234.5)).toBe("1.234,5");
  });

  it("passes formatting options through to Intl.NumberFormat", () => {
    const { number } = createFormatters("es-AR");

    expect(number(1234.5, { minimumFractionDigits: 2 })).toBe("1.234,50");
  });

  it("formats a date using the locale's conventions", () => {
    const { date } = createFormatters("es-AR");

    expect(date(new Date(2026, 0, 5))).toBe("5/1/2026");
  });

  it("passes formatting options through to Intl.DateTimeFormat", () => {
    const { date } = createFormatters("es-AR");

    expect(date(new Date(2026, 0, 5), { month: "long" })).toBe("enero");
  });
});
