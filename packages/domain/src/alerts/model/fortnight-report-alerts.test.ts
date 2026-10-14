import { describe, expect, it } from "vitest";
import {
  fortnightReportNoLongerPendingObservation,
  fortnightReportOverdueAlert,
  fortnightReportPendingObservation,
  fortnightReportPendingReason,
  pointOfSaleFortnightScope,
  pointOfSaleFortnightScopeDisplay,
} from "./fortnight-report-alerts.js";

const REGISTER_ID = "3f2b8c1e-5d4a-4b7e-9c10-a1b2c3d4e5f6";
const PRESENTATION = {
  pointOfSaleNumber: 4,
  registerId: REGISTER_ID,
  fortnight: { start: "2026-09-01", end: "2026-09-15" },
  deadline: "2026-09-23",
};

describe("pointOfSaleFortnightScope", () => {
  it("joins the point of sale and the day the fortnight starts", () => {
    expect(pointOfSaleFortnightScope(4, "2026-09-01")).toBe("4:2026-09-01");
  });

  it("tells apart the fortnights of one point of sale and the points of sale of one fortnight", () => {
    const scopes = new Set([
      pointOfSaleFortnightScope(4, "2026-09-01"),
      pointOfSaleFortnightScope(4, "2026-09-16"),
      pointOfSaleFortnightScope(5, "2026-09-01"),
    ]);

    expect(scopes.size).toBe(3);
  });
});

describe("pointOfSaleFortnightScopeDisplay", () => {
  it.each([
    ["4:2026-09-01", "4:2026-09-01:2026-09-15"],
    ["4:2026-09-16", "4:2026-09-16:2026-09-30"],
    ["12:2027-02-16", "12:2027-02-16:2027-02-28"],
  ])("adds the day the fortnight ends to the scope %s", (scope, display) => {
    expect(pointOfSaleFortnightScopeDisplay(scope)).toBe(display);
  });

  it.each(["", "4", "4:", "4:not-a-day", "4:x2026-09-01", "4:2026-09-01x"])(
    "shows the scope %j as it is",
    (scope) => {
      expect(pointOfSaleFortnightScopeDisplay(scope)).toBe(scope);
    },
  );
});

describe("fortnightReportPendingReason", () => {
  it.each([
    ["blocked", "blocked"],
    ["refused", "refused"],
    ["ready", "pending"],
    ["submitting", "pending"],
    [null, "pending"],
  ] as const)("is %s -> %s", (state, reason) => {
    expect(fortnightReportPendingReason(state)).toBe(reason);
  });
});

describe("fortnightReportPendingObservation", () => {
  it("holds the pending condition of the point of sale's fortnight at the warning level, naming the register, the fortnight, the deadline, the days left and why", () => {
    expect(
      fortnightReportPendingObservation({
        ...PRESENTATION,
        daysLeft: 5,
        pressing: false,
        state: null,
      }),
    ).toEqual({
      holds: true,
      level: "warning",
      alert: {
        kind: "fortnight_report_pending",
        scope: "4:2026-09-01",
        detail: {
          pointOfSaleNumber: 4,
          registerId: REGISTER_ID,
          fortnightStart: "2026-09-01",
          fortnightEnd: "2026-09-15",
          deadline: "2026-09-23",
          daysLeft: 5,
          reason: "pending",
        },
      },
    });
  });

  it("raises it to critical when the deadline is pressing", () => {
    expect(
      fortnightReportPendingObservation({
        ...PRESENTATION,
        daysLeft: 1,
        pressing: true,
        state: "refused",
      }),
    ).toMatchObject({
      level: "critical",
      alert: { detail: { daysLeft: 1, reason: "refused" } },
    });
  });

  it("raises it to critical while it is blocked, however far the deadline is", () => {
    expect(
      fortnightReportPendingObservation({
        ...PRESENTATION,
        daysLeft: 6,
        pressing: false,
        state: "blocked",
      }),
    ).toMatchObject({ level: "critical", alert: { detail: { reason: "blocked" } } });
  });
});

describe("fortnightReportNoLongerPendingObservation", () => {
  it("clears the pending condition of the scope", () => {
    expect(fortnightReportNoLongerPendingObservation("4:2026-09-01")).toEqual({
      holds: false,
      kind: "fortnight_report_pending",
      scope: "4:2026-09-01",
    });
  });
});

describe("fortnightReportOverdueAlert", () => {
  it("is the overdue alert of the point of sale's fortnight, naming the register, the fortnight and the deadline missed", () => {
    expect(fortnightReportOverdueAlert(PRESENTATION)).toEqual({
      kind: "fortnight_report_overdue",
      scope: "4:2026-09-01",
      detail: {
        pointOfSaleNumber: 4,
        registerId: REGISTER_ID,
        fortnightStart: "2026-09-01",
        fortnightEnd: "2026-09-15",
        deadline: "2026-09-23",
      },
    });
  });
});
