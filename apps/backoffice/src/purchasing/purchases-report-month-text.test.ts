import { expect, test } from "vitest";
import { purchasesReportMonthText } from "./purchases-report-month-text";

test.each([
  { month: "2026-01", text: "Enero 2026" },
  { month: "2026-09", text: "Septiembre 2026" },
  { month: "2026-12", text: "Diciembre 2026" },
])("writes $month as the month and the year in Spanish", ({ month, text }) => {
  expect(purchasesReportMonthText(month)).toBe(text);
});
