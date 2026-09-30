import { expect, test } from "vitest";
import { discountsListFilters, pricesListFilters } from "./routes";

test("opens the prices list on prices pending review, in every category", () => {
  expect(pricesListFilters.parse({})).toEqual({ search: "", category: "ALL", review: "pending" });
});

test("keeps the prices list filters a URL names, falling back for a value it does not offer", () => {
  const filters = { search: "yerba", category: "category-2", review: "all" };
  expect(pricesListFilters.parse(filters)).toEqual(filters);
  expect(pricesListFilters.parse({ search: false, category: 3, review: "later" })).toEqual(
    pricesListFilters.parse({}),
  );
});

test("opens the promotions list on current and scheduled promotions of every kind, ordered by name", () => {
  expect(discountsListFilters.parse({})).toEqual({
    search: "",
    kind: "ALL",
    status: "open",
    sortBy: "promotion",
    sort: "ascending",
  });
});

test("keeps the promotions list filters a URL names, falling back for a value it does not offer", () => {
  const filters = {
    search: "yerba",
    kind: "PERCENT_OFF",
    status: "deactivated",
    sortBy: "validity",
    sort: "descending",
  };
  expect(discountsListFilters.parse(filters)).toEqual(filters);
  expect(
    discountsListFilters.parse({
      search: false,
      kind: "BUY_N_PAY_M",
      status: "later",
      sortBy: "days",
      sort: "sideways",
    }),
  ).toEqual(discountsListFilters.parse({}));
});
