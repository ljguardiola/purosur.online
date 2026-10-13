import { expect, test } from "vitest";
import { reportQueryOf, withoutRefusedPeriod } from "./report-query";
import { FRONT_REGISTER_ID } from "./test-support/report-fixtures";

const noFilters = { from: "", to: "", register: "ALL" };

test("keeps the range and the register a URL names", () => {
  const filters = { from: "2026-10-01", to: "2026-10-07", register: FRONT_REGISTER_ID };

  expect(withoutRefusedPeriod(filters)).toEqual(filters);
});

test("keeps a one-day range", () => {
  const filters = { from: "2026-10-05", to: "2026-10-05", register: "ALL" };

  expect(withoutRefusedPeriod(filters)).toEqual(filters);
});

test("keeps no range as no range", () => {
  expect(withoutRefusedPeriod(noFilters)).toEqual(noFilters);
});

test.each([
  ["only the start", { from: "2026-10-01", to: "" }],
  ["only the end", { from: "", to: "2026-10-07" }],
  ["a start after the end", { from: "2026-10-08", to: "2026-10-07" }],
  ["a day that does not exist", { from: "2026-02-30", to: "2026-03-05" }],
  ["text that is not a day", { from: "ayer", to: "hoy" }],
])("falls back to no range for %s, keeping the rest", (_name, range) => {
  expect(withoutRefusedPeriod({ ...range, register: FRONT_REGISTER_ID, sortBy: "sales" })).toEqual({
    from: "",
    to: "",
    register: FRONT_REGISTER_ID,
    sortBy: "sales",
  });
});

test("asks for nothing when no range and no register are chosen", () => {
  expect(reportQueryOf(noFilters)).toEqual({});
});

test("asks for the range and the register chosen", () => {
  expect(
    reportQueryOf({ from: "2026-10-01", to: "2026-10-07", register: FRONT_REGISTER_ID }),
  ).toEqual({
    from: "2026-10-01",
    to: "2026-10-07",
    register_id: FRONT_REGISTER_ID,
  });
});
