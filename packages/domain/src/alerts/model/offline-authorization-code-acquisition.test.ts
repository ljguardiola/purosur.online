import { describe, expect, it } from "vitest";
import type { Fortnight } from "../../fiscal/index.js";
import type { AlertLevel } from "./alert-catalog.js";
import { offlineAuthorizationCodeAcquisitionLevel } from "./offline-authorization-code-acquisition.js";

function fortnight(start: string, end: string): Fortnight {
  return { start, end };
}

function levelsOn(period: Fortnight, days: readonly string[]): (AlertLevel | null)[] {
  return days.map((day) => offlineAuthorizationCodeAcquisitionLevel(period, day));
}

describe("offlineAuthorizationCodeAcquisitionLevel", () => {
  it("climbs through a second-half fortnight's window day by day, from the 11th to its end", () => {
    const secondHalf = fortnight("2026-10-16", "2026-10-31");

    expect(
      levelsOn(secondHalf, [
        "2026-10-10",
        "2026-10-11",
        "2026-10-12",
        "2026-10-13",
        "2026-10-14",
        "2026-10-15",
        "2026-10-16",
        "2026-10-25",
        "2026-10-31",
        "2026-11-01",
      ]),
    ).toEqual([
      null,
      "informational",
      "informational",
      "warning",
      "warning",
      "critical",
      "critical",
      "critical",
      "critical",
      null,
    ]);
  });

  it("opens the window of a first-half fortnight five days before the 1st, across the month change", () => {
    const firstHalf = fortnight("2026-11-01", "2026-11-15");

    expect(
      levelsOn(firstHalf, [
        "2026-10-26",
        "2026-10-27",
        "2026-10-28",
        "2026-10-29",
        "2026-10-30",
        "2026-10-31",
        "2026-11-01",
        "2026-11-15",
        "2026-11-16",
      ]),
    ).toEqual([
      null,
      "informational",
      "informational",
      "warning",
      "warning",
      "critical",
      "critical",
      "critical",
      null,
    ]);
  });

  it("opens the window of the fortnight starting March 1 on February 24 in a year that is not a leap year", () => {
    const march = fortnight("2026-03-01", "2026-03-15");

    expect(
      levelsOn(march, [
        "2026-02-23",
        "2026-02-24",
        "2026-02-25",
        "2026-02-26",
        "2026-02-27",
        "2026-02-28",
        "2026-03-01",
      ]),
    ).toEqual([
      null,
      "informational",
      "informational",
      "warning",
      "warning",
      "critical",
      "critical",
    ]);
  });

  it("opens the window of the fortnight starting March 1 on February 25 in a leap year", () => {
    const march = fortnight("2028-03-01", "2028-03-15");

    expect(
      levelsOn(march, [
        "2028-02-24",
        "2028-02-25",
        "2028-02-26",
        "2028-02-27",
        "2028-02-28",
        "2028-02-29",
        "2028-03-01",
      ]),
    ).toEqual([
      null,
      "informational",
      "informational",
      "warning",
      "warning",
      "critical",
      "critical",
    ]);
  });

  it.each([
    ["2026-02-16", "2026-02-28", "2026-03-01"],
    ["2028-02-16", "2028-02-29", "2028-03-01"],
  ])(
    "keeps the second half of February starting %s critical through its last day %s",
    (start, end, dayAfter) => {
      const february = fortnight(start, end);

      expect(levelsOn(february, [end, dayAfter])).toEqual(["critical", null]);
    },
  );
});
