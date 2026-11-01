import { expect, test } from "vitest";
import { monthNameOf, yearMonthLabel, yearMonthPhrase } from "./year-month-label";

test("writes a month with its year in Spanish as a label", () => {
  expect(yearMonthLabel("2026-09")).toBe("Septiembre 2026");
  expect(yearMonthLabel("2026-01")).toBe("Enero 2026");
});

test("writes a month with its year in Spanish inside a sentence", () => {
  expect(yearMonthPhrase("2026-09")).toBe("septiembre de 2026");
});

test("writes only the name of a month in lower case", () => {
  expect(monthNameOf("2026-03")).toBe("marzo");
});

test("shows a month it cannot read as it comes", () => {
  expect(yearMonthLabel("2026-13")).toBe("2026-13");
  expect(yearMonthPhrase("septiembre")).toBe("septiembre");
  expect(monthNameOf("2026")).toBe("2026");
});
