import { expect, test } from "vitest";
import { FRONT_REGISTER_ID } from "../shell/test-support/report-fixtures";
import { salesByPaymentMethodFilters } from "./sales-by-payment-method-filters";

test("opens on no range, every register and the biggest amount first", () => {
  expect(salesByPaymentMethodFilters.parse({})).toEqual({
    from: "",
    to: "",
    register: "ALL",
    sortBy: "amount",
    sort: "descending",
  });
});

test("keeps the range, the register and the order a URL names", () => {
  const filters = {
    from: "2026-10-01",
    to: "2026-10-07",
    register: FRONT_REGISTER_ID,
    sortBy: "method",
    sort: "ascending",
  };

  expect(salesByPaymentMethodFilters.parse(filters)).toEqual(filters);
});

test("falls back to no range for one the cloud would refuse, keeping the rest", () => {
  const parsed = salesByPaymentMethodFilters.parse({
    from: "2026-10-08",
    to: "2026-10-07",
    sortBy: "sales",
  });

  expect(parsed).toMatchObject({ from: "", to: "", sortBy: "sales" });
});

test.each([
  ["a column that does not exist", { sortBy: "share" }],
  ["a direction that does not exist", { sort: "up" }],
  ["values that are not text", { sortBy: 3, sort: false }],
])("falls back to the biggest amount first for %s", (_name, search) => {
  expect(salesByPaymentMethodFilters.parse(search)).toMatchObject({
    sortBy: "amount",
    sort: "descending",
  });
});
