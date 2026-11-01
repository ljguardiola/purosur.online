import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { exceptionalityFilters, exceptionalityYears } from "./exceptionality-filters";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-15T15:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

test("opens on the first fiscal address and the current year", () => {
  expect(exceptionalityFilters.parse({})).toEqual({ fiscalAddress: "", year: 2026 });
});

test("offers the current year and the two before it, the current one first", () => {
  expect(exceptionalityYears()).toEqual([2026, 2025, 2024]);
});

test("keeps a fiscal address and a year the screen offers", () => {
  expect(exceptionalityFilters.parse({ fiscalAddress: "fiscal-address-1", year: 2025 })).toEqual({
    fiscalAddress: "fiscal-address-1",
    year: 2025,
  });
});

test("reads a year written in the address, which comes as text", () => {
  expect(exceptionalityFilters.parse({ year: "2025" }).year).toBe(2025);
});

test.each([2027, 2023, 2025.5, "2025.5", "2023", "", null, "x"])(
  "falls back to the current year for the year %j, which the screen does not offer",
  (year) => {
    expect(exceptionalityFilters.parse({ year }).year).toBe(2026);
  },
);

test("falls back to the first fiscal address for a value that is no text", () => {
  expect(exceptionalityFilters.parse({ fiscalAddress: 7 }).fiscalAddress).toBe("");
});
