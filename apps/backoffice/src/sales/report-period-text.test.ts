import { expect, test } from "vitest";
import { reportPeriodText } from "./report-period-text";

test("names a range by its first and last day", () => {
  expect(reportPeriodText({ from: "2026-09-08", to: "2026-09-14" })).toBe(
    "Del 08/09/2026 al 14/09/2026",
  );
});

test("names a range that crosses a month and a year by both full dates", () => {
  expect(reportPeriodText({ from: "2026-12-25", to: "2027-01-02" })).toBe(
    "Del 25/12/2026 al 02/01/2027",
  );
});

test("names a single day by its date", () => {
  expect(reportPeriodText({ from: "2026-10-06", to: "2026-10-06" })).toBe("El 06/10/2026");
});
