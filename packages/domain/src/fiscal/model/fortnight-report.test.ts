import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { shiftCalendarDay } from "../../shared/index.js";
import {
  type FortnightReportState,
  fortnightClosesAt,
  fortnightReportDeadline,
  fortnightReportStanding,
  isFortnightReportOutstanding,
  isFortnightReportRetryDue,
  owesFortnightReport,
} from "./fortnight-report.js";
import { fortnightContaining } from "./offline-authorization-code.js";

const anyDay = fc
  .date({ min: new Date("2000-01-01T00:00:00Z"), max: new Date("2099-12-31T00:00:00Z") })
  .filter((date) => !Number.isNaN(date.getTime()))
  .map((date) => date.toISOString().slice(0, 10));

const anyFortnight = anyDay.map(fortnightContaining);

const FIRST_HALF = { start: "2026-09-01", end: "2026-09-15" };

describe("fortnightClosesAt", () => {
  it("is midnight, Argentina time, at the start of the day after the fortnight's last day", () => {
    expect(fortnightClosesAt(FIRST_HALF)).toEqual(new Date("2026-09-16T03:00:00.000Z"));
  });

  it("rolls over a month and a year end", () => {
    expect(fortnightClosesAt({ start: "2026-12-16", end: "2026-12-31" })).toEqual(
      new Date("2027-01-01T03:00:00.000Z"),
    );
  });
});

describe("fortnightReportDeadline", () => {
  it("is the eighth day after the fortnight closes when the tax authority's own deadline is later", () => {
    expect(fortnightReportDeadline(FIRST_HALF, "2026-09-30")).toBe("2026-09-23");
  });

  it("is the tax authority's own deadline when it comes first", () => {
    expect(fortnightReportDeadline(FIRST_HALF, "2026-09-20")).toBe("2026-09-20");
  });

  it("is that day when both coincide", () => {
    expect(fortnightReportDeadline(FIRST_HALF, "2026-09-23")).toBe("2026-09-23");
  });

  it("is the earlier of the two for every fortnight and tax authority deadline", () => {
    fc.assert(
      fc.property(anyFortnight, anyDay, (fortnight, own) => {
        const eighth = shiftCalendarDay(fortnight.end, 8);
        expect(fortnightReportDeadline(fortnight, own)).toBe(own < eighth ? own : eighth);
      }),
    );
  });
});

describe("fortnightReportStanding", () => {
  const report = (state: FortnightReportState | null) => ({
    fortnight: FIRST_HALF,
    deadline: "2026-09-23",
    state,
  });

  it("is not due while the fortnight is still running, its last day included", () => {
    expect(fortnightReportStanding(report(null), "2026-09-10")).toEqual({ kind: "not_due" });
    expect(fortnightReportStanding(report("blocked"), "2026-09-15")).toEqual({ kind: "not_due" });
  });

  it("is not due once accepted, before or after its deadline", () => {
    expect(fortnightReportStanding(report("accepted"), "2026-09-20")).toEqual({ kind: "not_due" });
    expect(fortnightReportStanding(report("accepted"), "2026-10-20")).toEqual({ kind: "not_due" });
  });

  it("is pending with the days left to its deadline from the day after the fortnight closes", () => {
    expect(fortnightReportStanding(report(null), "2026-09-16")).toEqual({
      kind: "pending",
      daysLeft: 7,
      pressing: false,
    });
  });

  it("is pressing the day before the deadline and on the deadline itself", () => {
    expect(fortnightReportStanding(report(null), "2026-09-21")).toEqual({
      kind: "pending",
      daysLeft: 2,
      pressing: false,
    });
    expect(fortnightReportStanding(report(null), "2026-09-22")).toEqual({
      kind: "pending",
      daysLeft: 1,
      pressing: true,
    });
    expect(fortnightReportStanding(report("refused"), "2026-09-23")).toEqual({
      kind: "pending",
      daysLeft: 0,
      pressing: true,
    });
  });

  it("is pending with no stored state or whatever the stored state that is not accepted", () => {
    for (const state of [null, "blocked", "submitting", "refused"] as const) {
      expect(fortnightReportStanding(report(state), "2026-09-18").kind).toBe("pending");
    }
  });

  it("is missed from the day after the deadline, with no stored state or whatever the stored state that is not accepted", () => {
    for (const state of [null, "blocked", "submitting", "refused"] as const) {
      expect(fortnightReportStanding(report(state), "2026-09-24")).toEqual({ kind: "missed" });
    }
  });

  it("is one of the three standings, decided by the day alone, for every day", () => {
    fc.assert(
      fc.property(anyFortnight, anyDay, (fortnight, today) => {
        const deadline = shiftCalendarDay(fortnight.end, 8);
        const standing = fortnightReportStanding({ fortnight, deadline, state: null }, today);
        if (today <= fortnight.end) {
          expect(standing).toEqual({ kind: "not_due" });
        } else if (today <= deadline) {
          expect(standing.kind).toBe("pending");
        } else {
          expect(standing).toEqual({ kind: "missed" });
        }
      }),
    );
  });
});

describe("owesFortnightReport", () => {
  const claimedBeforeClose = new Date("2026-09-10T12:00:00.000Z");

  it("is owed from the day after the fortnight closes by a point of sale claimed before its close", () => {
    expect(
      owesFortnightReport({ fortnight: FIRST_HALF, claimedAt: claimedBeforeClose }, "2026-09-16"),
    ).toBe(true);
    expect(
      owesFortnightReport({ fortnight: FIRST_HALF, claimedAt: claimedBeforeClose }, "2026-10-30"),
    ).toBe(true);
  });

  it("is not owed while the fortnight is still running, its last day included", () => {
    expect(
      owesFortnightReport({ fortnight: FIRST_HALF, claimedAt: claimedBeforeClose }, "2026-09-15"),
    ).toBe(false);
  });

  it("is owed by a point of sale claimed just before the fortnight closes, and not by one claimed at its close or after", () => {
    const owedWhenClaimedAt = (claimedAt: string) =>
      owesFortnightReport({ fortnight: FIRST_HALF, claimedAt: new Date(claimedAt) }, "2026-09-20");

    expect(owedWhenClaimedAt("2026-09-16T02:59:59.999Z")).toBe(true);
    expect(owedWhenClaimedAt("2026-09-16T03:00:00.000Z")).toBe(false);
    expect(owedWhenClaimedAt("2026-09-18T12:00:00.000Z")).toBe(false);
  });
});

describe("isFortnightReportOutstanding", () => {
  it.each([null, "blocked", "submitting", "refused"] as const)(
    "is outstanding with the stored state %s",
    (state) => {
      expect(isFortnightReportOutstanding(state)).toBe(true);
    },
  );

  it("is no longer outstanding once accepted", () => {
    expect(isFortnightReportOutstanding("accepted")).toBe(false);
  });
});

describe("isFortnightReportRetryDue", () => {
  const lastAttemptAt = new Date("2026-09-16T12:00:00.000Z");

  it("is not due before the interval has passed", () => {
    expect(isFortnightReportRetryDue(lastAttemptAt, new Date("2026-09-16T12:59:59.999Z"))).toBe(
      false,
    );
  });

  it("is due once the interval has passed exactly", () => {
    expect(isFortnightReportRetryDue(lastAttemptAt, new Date("2026-09-16T13:00:00.000Z"))).toBe(
      true,
    );
  });

  it("is due long after", () => {
    expect(isFortnightReportRetryDue(lastAttemptAt, new Date("2026-09-20T00:00:00.000Z"))).toBe(
      true,
    );
  });
});
