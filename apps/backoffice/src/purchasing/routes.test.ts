import { expect, test } from "vitest";
import { freightsListFilters, packagingsListFilters, suppliersListFilters } from "./routes";

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

test("opens the packagings list on active packagings, unsearched, by product ascending", () => {
  expect(packagingsListFilters.parse({})).toEqual({
    search: "",
    status: "active",
    sort: "ascending",
  });
});

test("keeps the packagings list filters a URL names, falling back for a value it does not offer", () => {
  const filters = { search: "caja", status: "inactive", sort: "descending" };
  expect(packagingsListFilters.parse(filters)).toEqual(filters);
  expect(packagingsListFilters.parse({ search: 1, status: "gone", sort: "up" })).toEqual(
    packagingsListFilters.parse({}),
  );
});

test("opens the freights list on the default period, unsearched", () => {
  expect(freightsListFilters.parse({})).toEqual({ search: "", period: 90 });
});

test("keeps the freights list filters a URL names", () => {
  expect(freightsListFilters.parse({ search: "expreso", period: 30 })).toEqual({
    search: "expreso",
    period: 30,
  });
  expect(freightsListFilters.parse({ period: "365" }).period).toBe(365);
});

test("falls back for a freights list filter the list does not offer", () => {
  expect(freightsListFilters.parse({ search: 1, period: 7 })).toEqual(freightsListFilters.parse({}));
  expect(freightsListFilters.parse({ period: "soon" })).toEqual(freightsListFilters.parse({}));
});
