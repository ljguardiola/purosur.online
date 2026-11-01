import { describe, expect, it } from "vitest";
import { exceptionShareYearQuerySchema, exceptionShareYearSchema } from "./exception-share-year.js";

describe("exceptionShareYearQuerySchema", () => {
  it("reads the asked year as a number", () => {
    expect(exceptionShareYearQuerySchema.parse({ year: "2026" })).toEqual({ year: 2026 });
  });

  it.each([
    ["no year", {}],
    ["a year with fewer digits", { year: "26" }],
    ["a year with more digits", { year: "20260" }],
    ["a year starting with zero", { year: "0999" }],
    ["a year that is not a number", { year: "abcd" }],
    ["a signed year", { year: "-2026" }],
  ])("refuses %s", (_name, query) => {
    expect(exceptionShareYearQuerySchema.safeParse(query).success).toBe(false);
  });
});

const month = {
  month: "2026-09",
  exception_count: 7,
  total_count: 120,
  share_tenths_of_percent: 58,
  state: "non_compliant",
};

const body = {
  fiscal_address: { id: "fa-1", name: "Local central" },
  year: 2026,
  months: [
    month,
    {
      month: "2026-10",
      exception_count: 0,
      total_count: 0,
      share_tenths_of_percent: null,
      state: "in_progress",
    },
  ],
  non_compliant_months: ["2026-09"],
};

describe("exceptionShareYearSchema", () => {
  it("accepts a year with its months and its non-compliant list", () => {
    expect(exceptionShareYearSchema.parse(body)).toEqual(body);
  });

  it("accepts a year that has no month yet", () => {
    const empty = { ...body, months: [], non_compliant_months: [] };

    expect(exceptionShareYearSchema.parse(empty)).toEqual(empty);
  });

  it.each(["non_compliant", "compliant", "in_progress"])("accepts the %s state", (state) => {
    const withState = { ...body, months: [{ ...month, state }] };

    expect(exceptionShareYearSchema.safeParse(withState).success).toBe(true);
  });

  it.each([
    ["a state that is not known", { months: [{ ...month, state: "late" }] }],
    ["a month that is not a calendar month", { months: [{ ...month, month: "2026-13" }] }],
    ["a month with text before it", { months: [{ ...month, month: "x2026-09" }] }],
    ["a month with text after it", { months: [{ ...month, month: "2026-09x" }] }],
    ["a month without its zero", { months: [{ ...month, month: "2026-9" }] }],
    ["a negative exception count", { months: [{ ...month, exception_count: -1 }] }],
    ["a negative total", { months: [{ ...month, total_count: -1 }] }],
    ["a fractional share", { months: [{ ...month, share_tenths_of_percent: 5.5 }] }],
    ["a listed month that is not a calendar month", { non_compliant_months: ["2026-00"] }],
    ["a year that is not a whole number", { year: 2026.5 }],
  ])("refuses %s", (_name, change) => {
    expect(exceptionShareYearSchema.safeParse({ ...body, ...change }).success).toBe(false);
  });

  it.each(["fiscal_address", "year", "months", "non_compliant_months"])(
    "requires the %s",
    (field) => {
      const { [field as keyof typeof body]: _omitted, ...rest } = body;

      expect(exceptionShareYearSchema.safeParse(rest).success).toBe(false);
    },
  );
});
