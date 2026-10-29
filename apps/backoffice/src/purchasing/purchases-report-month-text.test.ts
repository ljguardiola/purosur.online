import { expect, test } from "vitest";
import { purchasesReportMonthText } from "./purchases-report-month-text";

test.each([
  { month: "2026-01", text: "enero de 2026" },
  { month: "2026-09", text: "septiembre de 2026" },
  { month: "2026-12", text: "diciembre de 2026" },
])("writes $month as the month and the year in Spanish", ({ month, text }) => {
  expect(purchasesReportMonthText(month)).toBe(text);
});
