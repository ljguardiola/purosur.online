import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { FIXED_ARGENTINA_ZONE_RULES } from "../../shared/index.js";
import { ARCA_REACHABILITY_HORIZON_MS } from "./arca-reachability.js";
import {
  type ArcaAvailabilityRun,
  arcaAvailableSpans,
  CONTINGENCY_TIME_NON_COMPLIANCE_PERCENT,
  type ContingencyPart,
  type ContingencyReportingRegister,
  contingencyTimeMeasurement,
  monthWindow,
} from "./contingency-time-share.js";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const WINDOW = monthWindow("2026-10", FIXED_ARGENTINA_ZONE_RULES);
const MONTH_START = WINDOW.start.getTime();
const MONTH_MS = WINDOW.end.getTime() - MONTH_START;
const AFTER_THE_MONTH = new Date(WINDOW.end.getTime() + DAY);

function minute(offset: number): Date {
  return new Date(MONTH_START + offset * MINUTE);
}

function run(ok: boolean, firstMinute: number, lastMinute = firstMinute): ArcaAvailabilityRun {
  return { ok, firstCheckedAt: minute(firstMinute), lastCheckedAt: minute(lastMinute) };
}

function answeredBetween(ok: boolean, startMinute: number, endMinute: number): ArcaAvailabilityRun {
  return {
    ok,
    firstCheckedAt: minute(startMinute),
    lastCheckedAt: new Date(minute(endMinute).getTime() - ARCA_REACHABILITY_HORIZON_MS),
  };
}

function part(registerId: string, startMinute: number, endMinute: number | null): ContingencyPart {
  return {
    registerId,
    start: minute(startMinute),
    end: endMinute === null ? null : minute(endMinute),
  };
}

function reporting(
  registerId: string,
  reportingSinceMinute: number | null = -DAY / MINUTE,
  presence: { startMinute: number; endMinute: number }[] = [
    { startMinute: 0, endMinute: MONTH_MS / MINUTE },
  ],
  firstEnrolledAtMinute: number | null = -DAY / MINUTE,
): ContingencyReportingRegister {
  return {
    registerId,
    reportingSince: reportingSinceMinute === null ? null : minute(reportingSinceMinute),
    firstEnrolledAt: firstEnrolledAtMinute === null ? null : minute(firstEnrolledAtMinute),
    presence: presence.map(({ startMinute, endMinute }) => ({
      start: minute(startMinute),
      end: minute(endMinute),
    })),
  };
}

function measure({
  runs = [answeredBetween(true, 0, MONTH_MS / MINUTE)],
  parts = [],
  registers = [reporting("register-1")],
  now = AFTER_THE_MONTH,
  closed = true,
}: {
  runs?: ArcaAvailabilityRun[];
  parts?: ContingencyPart[];
  registers?: ContingencyReportingRegister[];
  now?: Date;
  closed?: boolean;
}) {
  return contingencyTimeMeasurement({ window: WINDOW, now, closed, runs, parts, registers });
}

describe("monthWindow", () => {
  it("spans from Argentina's midnight of the month's first day to the next month's", () => {
    expect(WINDOW).toEqual({
      start: new Date("2026-10-01T03:00:00.000Z"),
      end: new Date("2026-11-01T03:00:00.000Z"),
    });
  });

  it("rolls over the year in December", () => {
    expect(monthWindow("2026-12", FIXED_ARGENTINA_ZONE_RULES)).toEqual({
      start: new Date("2026-12-01T03:00:00.000Z"),
      end: new Date("2027-01-01T03:00:00.000Z"),
    });
  });
});

describe("arcaAvailableSpans", () => {
  it("holds an ok answer from its probe until the horizon when nothing follows", () => {
    expect(arcaAvailableSpans([run(true, 0)])).toEqual([
      { start: minute(0), end: new Date(minute(0).getTime() + ARCA_REACHABILITY_HORIZON_MS) },
    ]);
  });

  it("holds an ok answer until the next probe when it comes sooner than the horizon", () => {
    const first = { ok: true, firstCheckedAt: minute(0), lastCheckedAt: minute(0) };
    const second = {
      ok: false,
      firstCheckedAt: new Date(minute(0).getTime() + 30_000),
      lastCheckedAt: new Date(minute(0).getTime() + 30_000),
    };

    expect(arcaAvailableSpans([first, second])).toEqual([
      { start: minute(0), end: second.firstCheckedAt },
    ]);
  });

  it("caps the answer at the horizon when the next probe comes later, leaving the gap unavailable", () => {
    expect(arcaAvailableSpans([run(true, 0), run(true, 10)])).toEqual([
      { start: minute(0), end: new Date(minute(0).getTime() + ARCA_REACHABILITY_HORIZON_MS) },
      { start: minute(10), end: new Date(minute(10).getTime() + ARCA_REACHABILITY_HORIZON_MS) },
    ]);
  });

  it("holds a run of probes continuously from its first to the horizon after its last", () => {
    expect(arcaAvailableSpans([run(true, 0, 60)])).toEqual([
      { start: minute(0), end: new Date(minute(60).getTime() + ARCA_REACHABILITY_HORIZON_MS) },
    ]);
  });

  it("ends a run at the first probe of the run that follows it", () => {
    expect(arcaAvailableSpans([answeredBetween(true, 0, 60), run(false, 60)])).toEqual([
      { start: minute(0), end: minute(60) },
    ]);
  });

  it("never makes available the time a not ok answer holds", () => {
    expect(arcaAvailableSpans([run(false, 0, 60)])).toEqual([]);
  });

  it("answers the same whatever order the runs come in", () => {
    const runs = [run(true, 20), run(false, 5), run(true, 0)];

    expect(arcaAvailableSpans([...runs].reverse())).toEqual(arcaAvailableSpans(runs));
  });

  it("merges the spans of runs that follow one another without a gap", () => {
    expect(arcaAvailableSpans([answeredBetween(true, 0, 60), run(true, 60)])).toEqual([
      { start: minute(0), end: new Date(minute(60).getTime() + ARCA_REACHABILITY_HORIZON_MS) },
    ]);
  });

  it("leaves out the answer of a probe that another probe at the same instant replaced", () => {
    expect(arcaAvailableSpans([run(true, 0), run(false, 0)])).toEqual([]);
  });

  it("answers nothing without runs", () => {
    expect(arcaAvailableSpans([])).toEqual([]);
  });
});

describe("contingencyTimeMeasurement", () => {
  it("combines the overlapping contingency of two registers by union", () => {
    const result = measure({
      parts: [part("register-1", 600, 660), part("register-2", 630, 690)],
      registers: [reporting("register-1"), reporting("register-2")],
    });

    expect(result.contingencyMs).toBe(90 * MINUTE);
  });

  it("counts the same time once when a register reports it twice", () => {
    const result = measure({ parts: [part("register-1", 600, 660), part("register-1", 600, 660)] });

    expect(result.contingencyMs).toBe(60 * MINUTE);
  });

  it("measures against the time the tax authority's services were available", () => {
    const result = measure({
      runs: [answeredBetween(true, 0, 1_000), answeredBetween(false, 1_000, MONTH_MS / MINUTE)],
      parts: [part("register-1", 900, 1_100)],
    });

    expect(result.availableMs).toBe(1_000 * MINUTE);
    expect(result.contingencyMs).toBe(100 * MINUTE);
    expect(result.shareTenthsOfPercent).toBe(100);
  });

  it("leaves out of the denominator the time between probes the horizon does not cover", () => {
    const result = measure({ runs: [run(true, 0), run(true, 10)] });

    expect(result.availableMs).toBe(2 * ARCA_REACHABILITY_HORIZON_MS);
  });

  it("counts only the contingency that falls within a later span of availability", () => {
    const result = measure({
      runs: [answeredBetween(true, 0, 100), answeredBetween(true, 200, 300)],
      parts: [part("register-1", 220, 280)],
    });

    expect(result.contingencyMs).toBe(60 * MINUTE);
  });

  it("clips contingency that began before the month or runs past it", () => {
    const result = measure({
      parts: [part("register-1", -60, 30), part("register-2", MONTH_MS / MINUTE - 20, null)],
      registers: [reporting("register-1"), reporting("register-2")],
    });

    expect(result.contingencyMs).toBe(50 * MINUTE);
  });

  it("runs an open contingency part until now in the month in progress", () => {
    const result = measure({
      runs: [answeredBetween(true, 0, 1_000)],
      parts: [part("register-1", 400, null)],
      now: minute(1_000),
      closed: false,
    });

    expect(result.availableMs).toBe(1_000 * MINUTE);
    expect(result.contingencyMs).toBe(600 * MINUTE);
    expect(result.state).toBe("in_progress");
  });

  it("measures the month in progress only up to now", () => {
    const result = measure({
      runs: [answeredBetween(true, 0, MONTH_MS / MINUTE)],
      parts: [part("register-1", 100, 300)],
      now: minute(1_000),
      closed: false,
    });

    expect(result.availableMs).toBe(1_000 * MINUTE);
  });

  it("holds the last answer no further than now", () => {
    const result = measure({
      runs: [run(true, 0, 10)],
      now: new Date(minute(10).getTime() + 1_000),
      closed: false,
    });

    expect(result.availableMs).toBe(10 * MINUTE + 1_000);
  });

  it("states the share in tenths of a percent, rounded down", () => {
    const result = measure({
      runs: [answeredBetween(true, 0, 3)],
      parts: [part("register-1", 0, 1)],
    });

    expect(result.shareTenthsOfPercent).toBe(333);
  });

  it("is compliant at exactly the limit", () => {
    const result = measure({
      runs: [answeredBetween(true, 0, 2_000)],
      parts: [part("register-1", 0, 100)],
    });

    expect(CONTINGENCY_TIME_NON_COMPLIANCE_PERCENT).toBe(5);
    expect(result).toMatchObject({ shareTenthsOfPercent: 50, state: "compliant" });
  });

  it("is non-compliant strictly above the limit", () => {
    const result = measure({
      runs: [answeredBetween(true, 0, 2_000)],
      parts: [part("register-1", 0, 101)],
    });

    expect(result).toMatchObject({ shareTenthsOfPercent: 50, state: "non_compliant" });
  });

  it("is non-compliant by a single millisecond above the limit", () => {
    const result = measure({
      runs: [answeredBetween(true, 0, 2_000)],
      parts: [
        { registerId: "register-1", start: minute(0), end: new Date(minute(100).getTime() + 1) },
      ],
    });

    expect(result.state).toBe("non_compliant");
  });

  it("is 0% and compliant when every register reported and none was in contingency", () => {
    expect(measure({})).toMatchObject({
      contingencyMs: 0,
      shareTenthsOfPercent: 0,
      state: "compliant",
    });
  });

  it("has no data when the tax authority's services have no probe in the month", () => {
    expect(measure({ runs: [] })).toMatchObject({
      availableMs: 0,
      shareTenthsOfPercent: null,
      state: "no_data",
    });
  });

  it("has no data when the last probe before the month stops holding exactly when it begins", () => {
    expect(measure({ runs: [answeredBetween(true, -10, 0)] }).state).toBe("no_data");
  });

  it("has no data when the only probes of the month lie outside it", () => {
    const runs = [run(true, -2_000, -1_000)];

    expect(measure({ runs }).state).toBe("no_data");
  });

  it("has no share and no verdict beyond compliant when the services never answered ok", () => {
    expect(measure({ runs: [answeredBetween(false, 0, MONTH_MS / MINUTE)] })).toMatchObject({
      availableMs: 0,
      shareTenthsOfPercent: null,
      state: "compliant",
    });
  });

  it("has no data when a register at the address had not started reporting", () => {
    const result = measure({
      parts: [part("register-1", 600, 660)],
      registers: [reporting("register-1"), reporting("register-2", null)],
    });

    expect(result).toMatchObject({ shareTenthsOfPercent: null, state: "no_data" });
  });

  it("has no data when a register started reporting after the month began", () => {
    expect(measure({ registers: [reporting("register-1", 5)] }).state).toBe("no_data");
  });

  it("accepts a register that started reporting exactly when the month began", () => {
    expect(measure({ registers: [reporting("register-1", 0)] }).state).toBe("compliant");
  });

  it("counts a register that came to the address mid-month from the moment it came", () => {
    const presence = [{ startMinute: 1_000, endMinute: MONTH_MS / MINUTE }];

    expect(measure({ registers: [reporting("register-1", 1_000, presence)] }).state).toBe(
      "compliant",
    );
    expect(measure({ registers: [reporting("register-1", 1_001, presence)] }).state).toBe(
      "no_data",
    );
  });

  it("counts a register that left the address from the start of its first stay in the month", () => {
    const presence = [
      { startMinute: 0, endMinute: 100 },
      { startMinute: 5_000, endMinute: 6_000 },
    ];

    expect(measure({ registers: [reporting("register-1", 1, presence)] }).state).toBe("no_data");
  });

  it("uses the earliest stay in the month even when the stays come out of order", () => {
    const presence = [
      { startMinute: 5_000, endMinute: 6_000 },
      { startMinute: 200, endMinute: 300 },
    ];

    expect(measure({ registers: [reporting("register-1", 200, presence)] }).state).toBe(
      "compliant",
    );
    expect(measure({ registers: [reporting("register-1", 201, presence)] }).state).toBe("no_data");
  });

  it("ignores a register that was not at the address at any time of the month", () => {
    const result = measure({
      registers: [reporting("register-1"), reporting("register-2", null, [])],
    });

    expect(result.state).toBe("compliant");
  });

  it("ignores a stay that left no time in the month", () => {
    const stays = [{ startMinute: 50, endMinute: 50 }];

    expect(
      measure({ registers: [reporting("register-1"), reporting("register-2", null, stays)] }).state,
    ).toBe("compliant");
  });

  it("counts a register enrolled mid-month from its first enrollment", () => {
    const wholeMonth = [{ startMinute: 0, endMinute: MONTH_MS / MINUTE }];

    expect(measure({ registers: [reporting("register-1", 1_000, wholeMonth, 1_000)] }).state).toBe(
      "compliant",
    );
    expect(measure({ registers: [reporting("register-1", 1_001, wholeMonth, 1_000)] }).state).toBe(
      "no_data",
    );
  });

  it("counts a register enrolled between two stays from the start of the later stay", () => {
    const presence = [
      { startMinute: 0, endMinute: 100 },
      { startMinute: 5_000, endMinute: 6_000 },
    ];

    expect(measure({ registers: [reporting("register-1", 5_000, presence, 200)] }).state).toBe(
      "compliant",
    );
    expect(measure({ registers: [reporting("register-1", 5_001, presence, 200)] }).state).toBe(
      "no_data",
    );
  });

  it("ignores a register first enrolled when its stay at the address ended", () => {
    const presence = [{ startMinute: 0, endMinute: 1_000 }];

    expect(
      measure({
        registers: [reporting("register-1"), reporting("register-2", null, presence, 1_000)],
      }).state,
    ).toBe("compliant");
  });

  it("ignores a register at the address that was never enrolled", () => {
    expect(
      measure({
        registers: [reporting("register-1"), reporting("register-2", null, undefined, null)],
      }).state,
    ).toBe("compliant");
  });

  it("prefers having no data over the month being in progress", () => {
    expect(measure({ runs: [], now: minute(1_000), closed: false }).state).toBe("no_data");
  });

  it("reports the month in progress, with its figures, while it has not closed", () => {
    const result = measure({
      runs: [answeredBetween(true, 0, 1_000)],
      parts: [part("register-1", 0, 900)],
      now: minute(1_000),
      closed: false,
    });

    expect(result).toMatchObject({ shareTenthsOfPercent: 900, state: "in_progress" });
  });

  describe("for every input", () => {
    const aPart = fc
      .record({
        registerId: fc.constantFrom("register-1", "register-2", "register-3"),
        start: fc.integer({ min: -2_000, max: 50_000 }),
        length: fc.option(fc.integer({ min: 0, max: 5_000 }), { nil: null }),
      })
      .map(({ registerId, start, length }) =>
        part(registerId, start, length === null ? null : start + length),
      );
    const someRuns = fc
      .uniqueArray(fc.record({ at: fc.integer({ min: -100, max: 45_000 }), ok: fc.boolean() }), {
        selector: ({ at }) => at,
        maxLength: 30,
      })
      .map((probes) => probes.map(({ at, ok }) => run(ok, at)));
    const everyone = [reporting("register-1"), reporting("register-2"), reporting("register-3")];

    it("never counts more contingency than there was, than the month had or than was available", () => {
      fc.assert(
        fc.property(fc.array(aPart, { maxLength: 8 }), someRuns, (parts, runs) => {
          const result = measure({ parts, runs, registers: everyone });
          const summed = parts.reduce(
            (total, { start, end }) =>
              total +
              Math.max(
                0,
                Math.min(
                  end === null ? AFTER_THE_MONTH.getTime() : end.getTime(),
                  WINDOW.end.getTime(),
                ) - Math.max(start.getTime(), MONTH_START),
              ),
            0,
          );

          expect(result.contingencyMs).toBeGreaterThanOrEqual(0);
          expect(result.contingencyMs).toBeLessThanOrEqual(result.availableMs);
          expect(result.contingencyMs).toBeLessThanOrEqual(summed);
          expect(result.availableMs).toBeLessThanOrEqual(MONTH_MS);
        }),
      );
    });

    it("answers the same whatever order the contingency parts come in", () => {
      fc.assert(
        fc.property(fc.array(aPart, { maxLength: 8 }), someRuns, (parts, runs) => {
          expect(measure({ parts: [...parts].reverse(), runs, registers: everyone })).toEqual(
            measure({ parts, runs, registers: everyone }),
          );
        }),
      );
    });

    it("answers the same when every part is reported twice", () => {
      fc.assert(
        fc.property(fc.array(aPart, { maxLength: 8 }), someRuns, (parts, runs) => {
          expect(measure({ parts: [...parts, ...parts], runs, registers: everyone })).toEqual(
            measure({ parts, runs, registers: everyone }),
          );
        }),
      );
    });

    it("is non-compliant exactly when the closed month's share is strictly above the limit", () => {
      fc.assert(
        fc.property(fc.array(aPart, { maxLength: 8 }), someRuns, (parts, runs) => {
          const result = measure({ parts, runs, registers: everyone });

          if (result.state === "no_data") {
            return;
          }
          expect(result.state === "non_compliant").toBe(
            result.contingencyMs * 100 >
              result.availableMs * CONTINGENCY_TIME_NON_COMPLIANCE_PERCENT,
          );
        }),
      );
    });

    it("never states a share without an available time to measure against", () => {
      fc.assert(
        fc.property(fc.array(aPart, { maxLength: 8 }), someRuns, (parts, runs) => {
          const result = measure({ parts, runs, registers: everyone });

          expect(result.shareTenthsOfPercent === null).toBe(
            result.availableMs === 0 || result.state === "no_data",
          );
        }),
      );
    });
  });
});
