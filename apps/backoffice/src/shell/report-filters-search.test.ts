import { expect, test } from "vitest";
import { reportFiltersSearch } from "./report-filters-search";
import { FRONT_REGISTER_ID } from "./test-support/report-fixtures";

test("opens on no range and every register", () => {
  expect(reportFiltersSearch.parse({})).toEqual({ from: "", to: "", register: "ALL" });
});

test("keeps the range and the register a URL names", () => {
  const filters = { from: "2026-10-01", to: "2026-10-07", register: FRONT_REGISTER_ID };

  expect(reportFiltersSearch.parse(filters)).toEqual(filters);
});

test("falls back to every register for one that is not an id", () => {
  expect(reportFiltersSearch.parse({ register: "caja" }).register).toBe("ALL");
  expect(reportFiltersSearch.parse({ register: 3 }).register).toBe("ALL");
});

test("falls back to no range for values that are not text", () => {
  expect(reportFiltersSearch.parse({ from: 1, to: false })).toMatchObject({ from: "", to: "" });
});
