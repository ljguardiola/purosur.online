import { describe, expect, test } from "vitest";
import { supplierPriceComparisonFilters } from "./supplier-price-comparison-filters";

describe("supplierPriceComparisonFilters", () => {
  test("defaults to no search and every category", () => {
    expect(supplierPriceComparisonFilters.parse({})).toEqual({ search: "", category: "" });
  });

  test("keeps the search and the category a URL names", () => {
    expect(supplierPriceComparisonFilters.parse({ search: "miel", category: "Almacén" })).toEqual({
      search: "miel",
      category: "Almacén",
    });
  });

  test("falls back to the default for a value the list does not offer", () => {
    expect(supplierPriceComparisonFilters.parse({ search: 1, category: false })).toEqual({
      search: "",
      category: "",
    });
  });
});
