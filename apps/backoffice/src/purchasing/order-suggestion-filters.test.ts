import { expect, test } from "vitest";
import { orderSuggestionFilters } from "./order-suggestion-filters";

test("opens unsearched", () => {
  expect(orderSuggestionFilters.parse({})).toEqual({ search: "" });
});

test("keeps the search a URL names, falling back for a value that is not text", () => {
  expect(orderSuggestionFilters.parse({ search: "miel" })).toEqual({ search: "miel" });
  expect(orderSuggestionFilters.parse({ search: 1 })).toEqual({ search: "" });
});
