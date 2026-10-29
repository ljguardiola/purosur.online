import { describe, expect, it } from "vitest";
import { reportMonthSchema } from "./report-month.js";

describe("reportMonthSchema", () => {
  it.each(["2026-01", "2026-10", "2026-12", "1999-09"])("accepts the month %s", (month) => {
    expect(reportMonthSchema.parse(month)).toBe(month);
  });

  it.each([
    ["a month that is not a month", "octubre"],
    ["a month with a day", "2026-10-06"],
    ["a month number of zero", "2026-00"],
    ["a month number above twelve", "2026-13"],
    ["a month with a two digit year", "26-10"],
    ["a month with trailing text", "2026-10x"],
    ["a month with leading text", "x2026-10"],
  ])("refuses %s", (_name, month) => {
    expect(reportMonthSchema.safeParse(month).success).toBe(false);
  });
});
