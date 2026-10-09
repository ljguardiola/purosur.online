import { expect, test } from "vitest";
import { suppliersListFilters } from "./routes";

test("opens the suppliers list on active suppliers, unsearched, by name ascending", () => {
  expect(suppliersListFilters.parse({})).toEqual({
    search: "",
    status: "active",
    sort: "ascending",
  });
});

test("keeps the suppliers list filters a URL names, falling back for a value it does not offer", () => {
  const filters = { search: "and", status: "all", sort: "descending" };
  expect(suppliersListFilters.parse(filters)).toEqual(filters);
  expect(suppliersListFilters.parse({ search: 1, status: "gone", sort: "up" })).toEqual(
    suppliersListFilters.parse({}),
  );
});
