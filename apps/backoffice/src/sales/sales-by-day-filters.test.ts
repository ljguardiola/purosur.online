import { expect, test } from "vitest";
import { salesByDayFilters } from "./sales-by-day-filters";
import { FRONT_REGISTER_ID } from "./test-support/sales-fixtures";

test("opens on no range and every register", () => {
  expect(salesByDayFilters.parse({})).toEqual({ from: "", to: "", register: "ALL" });
});

test("keeps the range and the register a URL names", () => {
  const filters = { from: "2026-10-01", to: "2026-10-07", register: FRONT_REGISTER_ID };

  expect(salesByDayFilters.parse(filters)).toEqual(filters);
});

test("keeps a one-day range", () => {
  const filters = { from: "2026-10-05", to: "2026-10-05", register: "ALL" };

  expect(salesByDayFilters.parse(filters)).toEqual(filters);
});

test.each([
  ["only the start", { from: "2026-10-01" }],
  ["only the end", { to: "2026-10-07" }],
  ["a start after the end", { from: "2026-10-08", to: "2026-10-07" }],
  ["a day that does not exist", { from: "2026-02-30", to: "2026-03-05" }],
  ["text that is not a day", { from: "ayer", to: "hoy" }],
  ["values that are not text", { from: 1, to: false }],
])("falls back to no range for %s", (_name, search) => {
  expect(salesByDayFilters.parse({ ...search, register: FRONT_REGISTER_ID })).toEqual({
    from: "",
    to: "",
    register: FRONT_REGISTER_ID,
  });
});

test("falls back to every register for one that is not an id", () => {
  expect(salesByDayFilters.parse({ register: "caja" }).register).toBe("ALL");
  expect(salesByDayFilters.parse({ register: 3 }).register).toBe("ALL");
});
