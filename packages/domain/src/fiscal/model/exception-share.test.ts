import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  closedMonthsWindow,
  exceptionShareMonthState,
  exceptionShareTenthsOfPercent,
  isExceptionShareBreach,
  isMonthClosed,
  monthOfDay,
  monthsStartedInYear,
  nonCompliantMonthsOfYear,
} from "./exception-share.js";

const counts = fc.integer({ min: 0, max: 100_000 }).chain((totalCount) =>
  fc.record({
    exceptionCount: fc.integer({ min: 0, max: totalCount }),
    totalCount: fc.constant(totalCount),
  }),
);

describe("isExceptionShareBreach", () => {
  it("is reached when the exceptions are exactly 5% of the total", () => {
    expect(isExceptionShareBreach({ exceptionCount: 1, totalCount: 20 })).toBe(true);
    expect(isExceptionShareBreach({ exceptionCount: 5, totalCount: 100 })).toBe(true);
  });

  it("is not reached just under 5%", () => {
    expect(isExceptionShareBreach({ exceptionCount: 1, totalCount: 21 })).toBe(false);
    expect(isExceptionShareBreach({ exceptionCount: 49, totalCount: 1_000 })).toBe(false);
  });

  it("is not reached in a month without vouchers", () => {
    expect(isExceptionShareBreach({ exceptionCount: 0, totalCount: 0 })).toBe(false);
  });

  it("holds exactly when twenty times the exceptions reach the total", () => {
    fc.assert(
      fc.property(counts, (each) => {
        expect(isExceptionShareBreach(each)).toBe(
          each.totalCount > 0 && each.exceptionCount * 20 >= each.totalCount,
        );
      }),
    );
  });
});

describe("exceptionShareTenthsOfPercent", () => {
  it("is unknown without vouchers", () => {
    expect(exceptionShareTenthsOfPercent({ exceptionCount: 0, totalCount: 0 })).toBeNull();
  });

  it("floors instead of rounding, so a compliant share never reads as 5,0 %", () => {
    expect(exceptionShareTenthsOfPercent({ exceptionCount: 499, totalCount: 10_000 })).toBe(49);
    expect(exceptionShareTenthsOfPercent({ exceptionCount: 1, totalCount: 3 })).toBe(333);
    expect(exceptionShareTenthsOfPercent({ exceptionCount: 2, totalCount: 3 })).toBe(666);
  });

  it("reads 5,0 % or more exactly when the month is a breach", () => {
    fc.assert(
      fc.property(counts, (each) => {
        const share = exceptionShareTenthsOfPercent(each);
        expect(share !== null && share >= 50).toBe(isExceptionShareBreach(each));
      }),
    );
  });

  it("is the floor of the exact share in tenths of a percent", () => {
    fc.assert(
      fc.property(
        counts.filter((each) => each.totalCount > 0),
        ({ exceptionCount, totalCount }) => {
          expect(exceptionShareTenthsOfPercent({ exceptionCount, totalCount })).toBe(
            Math.floor((exceptionCount * 1000) / totalCount),
          );
        },
      ),
    );
  });
});

describe("monthOfDay", () => {
  it("names the calendar month of a day", () => {
    expect(monthOfDay("2026-10-31")).toBe("2026-10");
  });
});

describe("isMonthClosed", () => {
  it("is open on the month's last day", () => {
    expect(isMonthClosed("2026-10", "2026-10-31")).toBe(false);
    expect(isMonthClosed("2026-02", "2026-02-28")).toBe(false);
  });

  it("is closed from the day after the month's last day", () => {
    expect(isMonthClosed("2026-10", "2026-11-01")).toBe(true);
    expect(isMonthClosed("2026-02", "2026-03-01")).toBe(true);
    expect(isMonthClosed("2024-02", "2024-02-29")).toBe(false);
    expect(isMonthClosed("2024-02", "2024-03-01")).toBe(true);
  });

  it("is open earlier in the month and in earlier months", () => {
    expect(isMonthClosed("2026-10", "2026-10-01")).toBe(false);
    expect(isMonthClosed("2026-11", "2026-10-31")).toBe(false);
  });

  it("is closed in a later year", () => {
    expect(isMonthClosed("2025-12", "2026-01-01")).toBe(true);
    expect(isMonthClosed("2025-12", "2025-12-31")).toBe(false);
  });
});

describe("monthsStartedInYear", () => {
  it("lists every month of a past year", () => {
    expect(monthsStartedInYear(2025, "2026-03-10")).toEqual([
      "2025-01",
      "2025-02",
      "2025-03",
      "2025-04",
      "2025-05",
      "2025-06",
      "2025-07",
      "2025-08",
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
    ]);
  });

  it("stops at the current month in the current year", () => {
    expect(monthsStartedInYear(2026, "2026-03-10")).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(monthsStartedInYear(2026, "2026-12-31")).toHaveLength(12);
    expect(monthsStartedInYear(2026, "2026-01-01")).toEqual(["2026-01"]);
  });

  it("is empty for a year that has not started", () => {
    expect(monthsStartedInYear(2027, "2026-12-31")).toEqual([]);
  });
});

describe("closedMonthsWindow", () => {
  it("runs from the previous year's January to the month before the current one", () => {
    expect(closedMonthsWindow("2026-11-01")).toEqual({ from: "2025-01", through: "2026-10" });
    expect(closedMonthsWindow("2026-03-15")).toEqual({ from: "2025-01", through: "2026-02" });
  });

  it("crosses the year boundary in January", () => {
    expect(closedMonthsWindow("2026-01-01")).toEqual({ from: "2025-01", through: "2025-12" });
  });
});

describe("exceptionShareMonthState", () => {
  const compliant = { exceptionCount: 1, totalCount: 100 };
  const breaching = { exceptionCount: 5, totalCount: 100 };

  it("keeps a month in progress while it is open, whatever its running figure", () => {
    expect(exceptionShareMonthState({ counts: breaching, closed: false, recorded: false })).toBe(
      "in_progress",
    );
  });

  it("calls a closed month non-compliant when its figures reach the threshold", () => {
    expect(exceptionShareMonthState({ counts: breaching, closed: true, recorded: false })).toBe(
      "non_compliant",
    );
  });

  it("calls a closed month compliant under the threshold", () => {
    expect(exceptionShareMonthState({ counts: compliant, closed: true, recorded: false })).toBe(
      "compliant",
    );
  });

  it("keeps a recorded month non-compliant even when later vouchers lower its share", () => {
    expect(exceptionShareMonthState({ counts: compliant, closed: true, recorded: true })).toBe(
      "non_compliant",
    );
  });
});

describe("nonCompliantMonthsOfYear", () => {
  it("lists the year's months in order, without repeats", () => {
    expect(
      nonCompliantMonthsOfYear(2026, ["2026-09", "2026-02", "2025-12", "2026-09", "2027-01"]),
    ).toEqual(["2026-02", "2026-09"]);
  });

  it("is empty when the year has none", () => {
    expect(nonCompliantMonthsOfYear(2026, ["2025-12"])).toEqual([]);
  });
});
