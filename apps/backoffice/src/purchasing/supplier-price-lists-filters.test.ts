import { describe, expect, test } from "vitest";
import {
  supplierPriceListReviewFilters,
  supplierPriceListsFilters,
} from "./supplier-price-lists-filters";

describe("supplierPriceListsFilters", () => {
  test("defaults to no search and every state", () => {
    expect(supplierPriceListsFilters.parse({})).toEqual({ search: "", state: "ALL" });
  });

  test("keeps a state the list offers", () => {
    expect(supplierPriceListsFilters.parse({ state: "READ_FAILED" })).toEqual({
      search: "",
      state: "READ_FAILED",
    });
  });

  test("falls back to the default for a value the list does not offer", () => {
    expect(supplierPriceListsFilters.parse({ search: 3, state: "other" })).toEqual({
      search: "",
      state: "ALL",
    });
  });
});

describe("supplierPriceListReviewFilters", () => {
  test("defaults to no search and every item", () => {
    expect(supplierPriceListReviewFilters.parse({})).toEqual({ search: "", show: "all" });
  });

  test("keeps the unpriced items filter", () => {
    expect(supplierPriceListReviewFilters.parse({ show: "unpriced" }).show).toBe("unpriced");
  });

  test("falls back to the default for a value the review does not offer", () => {
    expect(supplierPriceListReviewFilters.parse({ search: false, show: "x" })).toEqual({
      search: "",
      show: "all",
    });
  });
});
