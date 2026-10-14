import { expect, test } from "vitest";
import { FRONT_REGISTER_ID } from "../shell/test-support/report-fixtures";
import { salesByCashierFilters } from "./sales-by-cashier-filters";

test("opens on no range, every register and the cashier with the most sales first", () => {
  expect(salesByCashierFilters.parse({})).toEqual({
    from: "",
    to: "",
    register: "ALL",
    sortBy: "sales",
    sort: "descending",
  });
});

test("keeps the range, the register and the order a URL names", () => {
  const filters = {
    from: "2026-10-01",
    to: "2026-10-07",
    register: FRONT_REGISTER_ID,
    sortBy: "averageTicket",
    sort: "ascending",
  };

  expect(salesByCashierFilters.parse(filters)).toEqual(filters);
});

test.each(["name", "sessions", "sales", "amount", "averageTicket"])(
  "offers to order by %s",
  (sortBy) => {
    expect(salesByCashierFilters.parse({ sortBy })).toMatchObject({ sortBy });
  },
);

test("falls back to no range for one the cloud would refuse, keeping the rest", () => {
  const parsed = salesByCashierFilters.parse({
    from: "2026-10-08",
    to: "2026-10-07",
    sortBy: "name",
  });

  expect(parsed).toMatchObject({ from: "", to: "", sortBy: "name" });
});

test.each([
  ["a column that does not exist", { sortBy: "units" }],
  ["a direction that does not exist", { sort: "up" }],
  ["values that are not text", { sortBy: 3, sort: false }],
])("falls back to the most sales first for %s", (_name, search) => {
  expect(salesByCashierFilters.parse(search)).toMatchObject({
    sortBy: "sales",
    sort: "descending",
  });
});
