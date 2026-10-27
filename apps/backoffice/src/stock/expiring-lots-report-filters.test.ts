import { expect, test } from "vitest";
import { expiringLotsReportFilters } from "./expiring-lots-report-filters";

test("opens on no period, which is the branch's window", () => {
  expect(expiringLotsReportFilters.parse({})).toEqual({ from: "", to: "" });
});

test("keeps the period a URL names", () => {
  const filters = { from: "2026-12-01", to: "2026-12-31" };

  expect(expiringLotsReportFilters.parse(filters)).toEqual(filters);
});

test.each([
  ["a period that is not text", { from: 3, to: false }],
  ["no period at all", { from: undefined, to: undefined }],
])("falls back to no period for %s", (_name, search) => {
  expect(expiringLotsReportFilters.parse(search)).toEqual({ from: "", to: "" });
});
