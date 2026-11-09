import { expect, test } from "vitest";
import {
  freightsListFilters,
  freightsListSearch,
  purchasesListFilters,
  purchasesListSearch,
  suppliersListFilters,
} from "./routes";

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

const NO_FREIGHT_RANGE = { byMonth: false, from: "", to: "" };

test("opens the freights list on the default period, unsearched, not grouped by month", () => {
  expect(freightsListFilters.parse({})).toEqual({ search: "", period: 90, ...NO_FREIGHT_RANGE });
});

test("keeps the freights list filters a URL names", () => {
  expect(freightsListFilters.parse({ search: "expreso", period: 30 })).toEqual({
    search: "expreso",
    period: 30,
    ...NO_FREIGHT_RANGE,
  });
  expect(freightsListFilters.parse({ period: "365" }).period).toBe(365);
});

test("falls back for a freights list filter the list does not offer", () => {
  expect(freightsListFilters.parse({ search: 1, period: 7 })).toEqual(
    freightsListFilters.parse({}),
  );
  expect(freightsListFilters.parse({ period: "soon" })).toEqual(freightsListFilters.parse({}));
});

test("reads the freights by month view from a boolean or its text, and a range the reports accept", () => {
  expect(freightsListFilters.parse({ byMonth: true })).toMatchObject({ byMonth: true });
  expect(freightsListFilters.parse({ byMonth: "true" })).toMatchObject({ byMonth: true });
  expect(freightsListFilters.parse({ byMonth: "maybe" })).toMatchObject({ byMonth: false });
  expect(freightsListFilters.parse({ from: "2026-10-02", to: "2026-10-05" })).toMatchObject({
    from: "2026-10-02",
    to: "2026-10-05",
  });
});

test("drops a freights range the reports refuse", () => {
  expect(freightsListFilters.parse({ from: "2026-10-05", to: "2026-10-02" })).toMatchObject(
    NO_FREIGHT_RANGE,
  );
});

const SUPPLIER = "90e00000-0000-4000-8000-0000000000a1";

test("keeps the supplier of the freights list while it is not grouped by month", () => {
  expect(freightsListSearch.parse({ supplier: SUPPLIER })).toMatchObject({ supplier: SUPPLIER });
  expect(freightsListSearch.parse({ supplier: "x" })).toMatchObject({ supplier: undefined });
});

test("drops the supplier of the freights list while it is grouped by month", () => {
  expect(freightsListSearch.parse({ byMonth: true, supplier: SUPPLIER })).toMatchObject({
    byMonth: true,
    supplier: undefined,
  });
});

test("opens the purchases list not grouped by supplier and with no range", () => {
  expect(purchasesListFilters.parse({})).toEqual({ bySupplier: false, from: "", to: "" });
});

test("reads the grouping by supplier from a boolean or its text, and a range the reports accept", () => {
  expect(purchasesListFilters.parse({ bySupplier: true })).toMatchObject({ bySupplier: true });
  expect(purchasesListFilters.parse({ bySupplier: "true" })).toMatchObject({ bySupplier: true });
  expect(purchasesListFilters.parse({ bySupplier: "maybe" })).toMatchObject({ bySupplier: false });
  expect(purchasesListFilters.parse({ from: "2026-10-02", to: "2026-10-05" })).toMatchObject({
    from: "2026-10-02",
    to: "2026-10-05",
  });
});

test("drops a purchases range the reports refuse", () => {
  expect(purchasesListFilters.parse({ from: "2026-10-05", to: "2026-10-02" })).toEqual(
    purchasesListFilters.parse({}),
  );
});

test("keeps the supplier of the purchases list while it is not grouped by supplier", () => {
  expect(purchasesListSearch.parse({ supplier: SUPPLIER })).toMatchObject({ supplier: SUPPLIER });
  expect(purchasesListSearch.parse({ supplier: "x" })).toMatchObject({ supplier: undefined });
});

test("drops the supplier of the purchases list while it is grouped by supplier", () => {
  expect(purchasesListSearch.parse({ bySupplier: true, supplier: SUPPLIER })).toMatchObject({
    bySupplier: true,
    supplier: undefined,
  });
});

test("keeps the purchase open in the purchases list when it is a record id, and drops anything else", () => {
  expect(purchasesListSearch.parse({ purchase: SUPPLIER })).toMatchObject({ purchase: SUPPLIER });
  expect(purchasesListSearch.parse({ purchase: "x" })).toMatchObject({ purchase: undefined });
  expect(purchasesListSearch.parse({})).toMatchObject({ purchase: undefined });
});
