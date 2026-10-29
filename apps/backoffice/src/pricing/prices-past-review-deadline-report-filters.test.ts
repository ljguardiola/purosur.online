import { expect, test } from "vitest";
import { pricesPastReviewDeadlineReportFilters } from "./prices-past-review-deadline-report-filters";

test("opens on no period, which is the cloud's default", () => {
  expect(pricesPastReviewDeadlineReportFilters.parse({})).toEqual({ from: "", to: "" });
});

test("keeps the period a URL names", () => {
  const filters = { from: "2026-12-01", to: "2026-12-31" };

  expect(pricesPastReviewDeadlineReportFilters.parse(filters)).toEqual(filters);
});

test.each([
  ["a period that is not text", { from: 3, to: false }],
  ["no period at all", { from: undefined, to: undefined }],
  ["a period that ends before it starts", { from: "2026-12-31", to: "2026-12-01" }],
  ["a period with only its start", { from: "2026-12-01" }],
  ["a period with only its end", { to: "2026-12-31" }],
  ["a period whose bounds are not days", { from: "2026-02-30", to: "mañana" }],
])("falls back to no period for %s", (_name, search) => {
  expect(pricesPastReviewDeadlineReportFilters.parse(search)).toEqual({ from: "", to: "" });
});
