import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  formatAmountInput,
  formatCents,
  formatClockTime,
  formatDate,
  formatMonthAndYear,
  formatMonthName,
  formatNumber,
  formatPointOfSaleNumber,
  formatTimeAgo,
  parsePointOfSaleNumber,
  plural,
} from "./formatters";
import { parseAmountCents } from "./parsers";

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

describe("formatAmountInput", () => {
  it("writes an amount in cents as the text a person types, with no currency sign", () => {
    expect(formatAmountInput(420_000)).toBe("4.200,00");
    expect(formatAmountInput(5)).toBe("0,05");
    expect(formatAmountInput(0)).toBe("0,00");
    expect(formatAmountInput(2_147_483_647)).toBe("21.474.836,47");
  });

  it("reads back as the cents it was written from", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 99_999_999_999_900 }), (cents) => {
        expect(parseAmountCents(formatAmountInput(cents))).toBe(cents);
      }),
    );
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

describe("formatPointOfSaleNumber", () => {
  it("pads the number with zeros to the five digits the tax authority prints", () => {
    expect(formatPointOfSaleNumber(7)).toBe("00007");
    expect(formatPointOfSaleNumber(1234)).toBe("01234");
  });

  it("keeps a number that already has five digits as it is", () => {
    expect(formatPointOfSaleNumber(99999)).toBe("99999");
  });
});

describe("parsePointOfSaleNumber", () => {
  it.each([
    ["3", 3],
    [" 12 ", 12],
    ["00003", 3],
    ["99999", 99999],
  ])("reads the bare identifier %j as %d", (typed, expected) => {
    expect(parsePointOfSaleNumber(typed)).toBe(expected);
  });

  it.each(["1.234", "12.345", "1e1", "0x1F", "+7", "12.0", "1,5", "-3", ""])(
    "refuses %j, which is not made of digits only",
    (typed) => {
      expect(parsePointOfSaleNumber(typed)).toBeNaN();
    },
  );
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

describe("formatClockTime", () => {
  it("writes the hour and minutes of the clock the instant is written in", () => {
    expect(formatClockTime("2026-09-30T12:05:00.000-03:00")).toBe("12:05");
  });

  it("uses a 24-hour clock", () => {
    expect(formatClockTime("2026-09-30T20:40:00.000-03:00")).toBe("20:40");
  });

  it("keeps the clock of an instant written in UTC", () => {
    expect(formatClockTime("2026-10-01T02:30:00.000Z")).toBe("02:30");
  });

  it("keeps the clock of an instant written ahead of UTC", () => {
    expect(formatClockTime("2026-10-01T09:15:00.000+05:30")).toBe("09:15");
  });
});
