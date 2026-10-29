import { expect, test } from "vitest";
import { reportPeriodFilters } from "./report-period-filters";

test("opens on no period, which is the cloud's default", () => {
  expect(reportPeriodFilters.parse({})).toEqual({ from: "", to: "" });
});

test("keeps the period a URL names", () => {
  const filters = { from: "2026-09-01", to: "2026-10-31" };

  expect(reportPeriodFilters.parse(filters)).toEqual(filters);
});

test.each([
  ["a period that is not text", { from: 3, to: false }],
  ["a period that ends before it starts", { from: "2026-12-31", to: "2026-12-01" }],
  ["a period with only its start", { from: "2026-12-01" }],
  ["a period whose bounds are not days", { from: "2026-02-30", to: "mañana" }],
])("falls back to no period for %s", (_name, search) => {
  expect(reportPeriodFilters.parse(search)).toEqual({ from: "", to: "" });
});
