import { describe, expect, it } from "vitest";
import { reportMonthOf } from "./report-month.js";

describe("reportMonthOf", () => {
  it.each([
    ["2026-10-06", "2026-10"],
    ["2026-09-30", "2026-09"],
    ["2026-10-01", "2026-10"],
    ["2027-01-31", "2027-01"],
  ])("names the calendar month of %s", (day, month) => {
    expect(reportMonthOf(day)).toBe(month);
  });
});
