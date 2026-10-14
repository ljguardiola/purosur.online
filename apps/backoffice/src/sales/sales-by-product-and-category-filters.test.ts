import { expect, test } from "vitest";
import { FRONT_REGISTER_ID } from "../shell/test-support/report-fixtures";
import { salesByProductAndCategoryFilters } from "./sales-by-product-and-category-filters";

test("opens on no range, every register, the categories and the biggest amount first", () => {
  expect(salesByProductAndCategoryFilters.parse({})).toEqual({
    from: "",
    to: "",
    register: "ALL",
    group: "category",
    sortBy: "amount",
    sort: "descending",
  });
});

test("keeps the range, the register, the grouping and the order a URL names", () => {
  const filters = {
    from: "2026-10-01",
    to: "2026-10-07",
    register: FRONT_REGISTER_ID,
    group: "product",
    sortBy: "name",
    sort: "ascending",
  };

  expect(salesByProductAndCategoryFilters.parse(filters)).toEqual(filters);
});

test("falls back to no range for one the cloud would refuse, keeping the rest", () => {
  const parsed = salesByProductAndCategoryFilters.parse({
    from: "2026-10-08",
    to: "2026-10-07",
    group: "product",
  });

  expect(parsed).toMatchObject({ from: "", to: "", group: "product" });
});

test.each([
  ["a grouping that does not exist", { group: "brand" }],
  ["a grouping that is not text", { group: 3 }],
])("falls back to the categories for %s", (_name, search) => {
  expect(salesByProductAndCategoryFilters.parse(search)).toMatchObject({ group: "category" });
});

test.each([
  ["a column that does not exist", { sortBy: "units" }],
  ["a direction that does not exist", { sort: "up" }],
  ["values that are not text", { sortBy: 3, sort: false }],
])("falls back to the biggest amount first for %s", (_name, search) => {
  expect(salesByProductAndCategoryFilters.parse(search)).toMatchObject({
    sortBy: "amount",
    sort: "descending",
  });
});
