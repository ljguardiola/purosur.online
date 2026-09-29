import { expect, test } from "vitest";
import { brandsListFilters, categoriesListFilters, productsListFilters } from "./routes";

test("opens the products list on active products, every category and unit, by name ascending", () => {
  expect(productsListFilters.parse({})).toEqual({
    search: "",
    category: "ALL",
    unit: "ALL",
    status: "active",
    sort: "ascending",
  });
});

test("keeps the products list filters a URL names", () => {
  const filters = {
    search: "miel",
    category: "category-1",
    unit: "KG",
    status: "inactive",
    sort: "descending",
  };
  expect(productsListFilters.parse(filters)).toEqual(filters);
});

test("falls back to each products list default for a value the list does not offer", () => {
  expect(
    productsListFilters.parse({ search: 7, category: [], unit: "LITRE", status: "x", sort: "up" }),
  ).toEqual(productsListFilters.parse({}));
});

test("opens the categories list unfiltered, by name ascending", () => {
  expect(categoriesListFilters.parse({})).toEqual({ search: "", sort: "ascending" });
});

test("keeps the categories list filters a URL names, falling back for a value it does not offer", () => {
  expect(categoriesListFilters.parse({ search: "alma", sort: "descending" })).toEqual({
    search: "alma",
    sort: "descending",
  });
  expect(categoriesListFilters.parse({ search: null, sort: "sideways" })).toEqual({
    search: "",
    sort: "ascending",
  });
});

test("opens the brands list on active brands, unsearched, by name ascending", () => {
  expect(brandsListFilters.parse({})).toEqual({
    search: "",
    status: "active",
    sortBy: "brand",
    sort: "ascending",
  });
});

test("keeps the brands list filters a URL names, falling back for a value it does not offer", () => {
  const filters = { search: "gra", status: "all", sortBy: "products", sort: "descending" };
  expect(brandsListFilters.parse(filters)).toEqual(filters);
  expect(
    brandsListFilters.parse({ search: 1, status: "gone", sortBy: "name", sort: "up" }),
  ).toEqual(brandsListFilters.parse({}));
});
