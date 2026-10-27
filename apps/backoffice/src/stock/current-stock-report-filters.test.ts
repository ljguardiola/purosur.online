import { expect, test } from "vitest";
import { currentStockReportFilters } from "./current-stock-report-filters";
import { NUTS_CATEGORY_ID } from "./test-support/current-stock-report-fixtures";

test("opens on every category with the most valuable product first", () => {
  expect(currentStockReportFilters.parse({})).toEqual({
    category: "ALL",
    sortBy: "value",
    sort: "descending",
  });
});

test("keeps the category and the order a URL names", () => {
  const filters = { category: NUTS_CATEGORY_ID, sortBy: "product", sort: "ascending" };

  expect(currentStockReportFilters.parse(filters)).toEqual(filters);
});

test.each([
  ["a category that is not an id", { category: "frutos-secos" }],
  ["a category that is not text", { category: 3 }],
])("falls back to every category for %s", (_name, search) => {
  expect(currentStockReportFilters.parse(search)).toMatchObject({ category: "ALL" });
});

test.each([
  ["a column that does not exist", { sortBy: "price" }],
  ["a direction that does not exist", { sort: "up" }],
  ["values that are not text", { sortBy: 3, sort: false }],
])("falls back to the most valuable first for %s", (_name, search) => {
  expect(currentStockReportFilters.parse(search)).toMatchObject({
    sortBy: "value",
    sort: "descending",
  });
});

test.each(["product", "lots", "balance", "value"] as const)("offers sorting by %s", (sortBy) => {
  expect(currentStockReportFilters.parse({ sortBy })).toMatchObject({ sortBy });
});
