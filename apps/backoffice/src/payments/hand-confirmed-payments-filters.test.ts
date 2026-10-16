import { expect, test } from "vitest";
import { FRONT_REGISTER_ID } from "../shell/test-support/report-fixtures";
import {
  handConfirmedPaymentsFilters,
  handConfirmedPaymentsQueryOf,
} from "./hand-confirmed-payments-filters";

test("opens on no range, every register and every method", () => {
  expect(handConfirmedPaymentsFilters.parse({})).toEqual({
    from: "",
    to: "",
    register: "ALL",
    method: "ALL",
  });
});

test.each(["TRANSFER", "STANDALONE_TERMINAL"])("keeps the method %s a URL names", (method) => {
  const filters = {
    from: "2026-10-01",
    to: "2026-10-07",
    register: FRONT_REGISTER_ID,
    method,
  };

  expect(handConfirmedPaymentsFilters.parse(filters)).toEqual(filters);
});

test("falls back to no range for one the cloud would refuse, keeping the method", () => {
  const parsed = handConfirmedPaymentsFilters.parse({
    from: "2026-10-08",
    to: "2026-10-07",
    method: "TRANSFER",
  });

  expect(parsed).toMatchObject({ from: "", to: "", method: "TRANSFER" });
});

test.each([
  ["a method that is not confirmed by hand", { method: "CASH" }],
  ["a method that does not exist", { method: "CHEQUE" }],
  ["a value that is not text", { method: 3 }],
])("falls back to every method for %s", (_name, search) => {
  expect(handConfirmedPaymentsFilters.parse(search)).toMatchObject({ method: "ALL" });
});

test("asks for nothing when no filter is chosen", () => {
  expect(handConfirmedPaymentsQueryOf(handConfirmedPaymentsFilters.parse({}))).toEqual({});
});

test("asks for the range, the register and the method chosen", () => {
  const filters = handConfirmedPaymentsFilters.parse({
    from: "2026-10-01",
    to: "2026-10-07",
    register: FRONT_REGISTER_ID,
    method: "STANDALONE_TERMINAL",
  });

  expect(handConfirmedPaymentsQueryOf(filters)).toEqual({
    from: "2026-10-01",
    to: "2026-10-07",
    register_id: FRONT_REGISTER_ID,
    method: "STANDALONE_TERMINAL",
  });
});
