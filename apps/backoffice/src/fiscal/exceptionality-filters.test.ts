import { expect, test } from "vitest";
import { exceptionalityFilters } from "./exceptionality-filters";

test("opens on the first fiscal address and on the year the cloud answers, asking for none", () => {
  expect(exceptionalityFilters.parse({})).toEqual({ fiscalAddress: "" });
});

test("keeps a fiscal address and a year", () => {
  expect(exceptionalityFilters.parse({ fiscalAddress: "fiscal-address-1", year: 2025 })).toEqual({
    fiscalAddress: "fiscal-address-1",
    year: 2025,
  });
});

test("reads a year written in the address, which comes as text", () => {
  expect(exceptionalityFilters.parse({ year: "2025" }).year).toBe(2025);
});

test.each([2025.5, "2025.5", "20250", "999", "", null, "x", 0])(
  "asks for no year when the year is %j",
  (year) => {
    expect(exceptionalityFilters.parse({ year }).year).toBeUndefined();
  },
);

test("falls back to the first fiscal address for a value that is no text", () => {
  expect(exceptionalityFilters.parse({ fiscalAddress: 7 }).fiscalAddress).toBe("");
});
