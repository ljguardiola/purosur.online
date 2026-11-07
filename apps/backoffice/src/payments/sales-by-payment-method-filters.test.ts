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
    handConfirmed: false,
    method: "ALL",
  });
});

test("keeps the range, the register and the order a URL names", () => {
  const filters = {
    from: "2026-10-01",
    to: "2026-10-07",
    register: FRONT_REGISTER_ID,
    sortBy: "method",
    sort: "ascending",
    handConfirmed: false,
    method: "ALL",
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

test("keeps the hand-confirmed payments filter and the method a URL names", () => {
  const filters = {
    from: "",
    to: "",
    register: "ALL",
    sortBy: "amount",
    sort: "descending",
    handConfirmed: true,
    method: "TRANSFER",
  };

  expect(salesByPaymentMethodFilters.parse(filters)).toEqual(filters);
});

test.each([
  ["a hand-confirmed value that is not a boolean", { handConfirmed: "maybe" }],
  ["a method that does not exist", { method: "CASH" }],
])("falls back to the defaults for %s", (_name, input) => {
  expect(salesByPaymentMethodFilters.parse(input)).toMatchObject({
    handConfirmed: false,
    method: "ALL",
  });
});

test("reads the hand-confirmed filter a URL writes as text", () => {
  expect(salesByPaymentMethodFilters.parse({ handConfirmed: "true" })).toMatchObject({
    handConfirmed: true,
  });
  expect(salesByPaymentMethodFilters.parse({ handConfirmed: "false" })).toMatchObject({
    handConfirmed: false,
  });
});

test("falls back to every method when the hand-confirmed filter is off, since only it offers a method", () => {
  expect(salesByPaymentMethodFilters.parse({ method: "TRANSFER" })).toMatchObject({
    handConfirmed: false,
    method: "ALL",
  });
});
