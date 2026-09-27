import { expect, test } from "vitest";
import { pricesListFilters } from "./routes";

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
