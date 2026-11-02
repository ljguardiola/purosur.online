import { describe, expect, it } from "vitest";
import { argentinaInstant, FIXED_ARGENTINA_ZONE_RULES } from "../../shared/index.js";
import { FakeZoneRulesSource } from "../../shared/test-support/fake-zone-rules-source.js";
import { ARCA_REACHABILITY_HORIZON_MS } from "../model/arca-reachability.js";
import {
  type ArcaAvailabilityRun,
  type ContingencyPart,
  type ContingencyReportingRegister,
  monthWindow,
} from "../model/contingency-time-share.js";
import { readExceptionShareYear } from "./read-exception-share-year.js";
import type { MonthlyVoucherCounts } from "./read-exception-share-year-ports.js";
import { FakeArcaAvailabilityReader } from "./test-support/fake-arca-availability-reader.js";
import { FakeContingencyIntervalsReader } from "./test-support/fake-contingency-intervals-reader.js";
import { FakeExceptionShareYearReader } from "./test-support/fake-exception-share-year-reader.js";
import { FixedClock } from "./test-support/fixed-clock.js";

const FISCAL_ADDRESS = { id: "fa-1", name: "Local central" };

function at(day: string, time = "12:00"): Date {
  return new Date(argentinaInstant(day, time, FIXED_ARGENTINA_ZONE_RULES));
}

function counts(month: string, exceptionCount: number, totalCount: number): MonthlyVoucherCounts {
  return { month, exceptionCount, totalCount };
}

const MINUTE = 60_000;
const NO_DATA = {
  contingencyMs: 0,
  availableMs: 0,
  shareTenthsOfPercent: null,
  state: "no_data",
} as const;

const REPORTING_THROUGHOUT: ContingencyReportingRegister = {
  registerId: "register-1",
  reportingSince: at("2025-12-01"),
  firstEnrolledAt: at("2025-12-01"),
  presence: [{ start: at("2025-12-01"), end: at("2027-01-01") }],
};

function availableThroughout(month: string): ArcaAvailabilityRun {
  const { start, end } = monthWindow(month, FIXED_ARGENTINA_ZONE_RULES);
  return {
    ok: true,
    firstCheckedAt: start,
    lastCheckedAt: new Date(end.getTime() - ARCA_REACHABILITY_HORIZON_MS),
  };
}

function inContingency(month: string, days: number): ContingencyPart {
  const { start } = monthWindow(month, FIXED_ARGENTINA_ZONE_RULES);
  return {
    registerId: "register-1",
    start,
    end: new Date(start.getTime() + days * 24 * 60 * MINUTE),
  };
}

async function read(
  reader: FakeExceptionShareYearReader,
  now: Date,
  year: number | undefined,
  fiscalAddressId = FISCAL_ADDRESS.id,
  readers: {
    availability?: FakeArcaAvailabilityReader;
    contingency?: FakeContingencyIntervalsReader;
  } = {},
) {
  return readExceptionShareYear(
    {
      reader,
      availability: readers.availability ?? new FakeArcaAvailabilityReader(),
      contingency: readers.contingency ?? new FakeContingencyIntervalsReader(),
      clock: new FixedClock(now),
      zoneRules: new FakeZoneRulesSource(),
    },
    { fiscalAddressId, year },
  );
}

describe("readExceptionShareYear", () => {
  it("says so when the fiscal address does not exist", async () => {
    const reader = new FakeExceptionShareYearReader([]);

    expect(await read(reader, at("2026-10-15"), 2026)).toEqual({
      kind: "fiscal_address_not_found",
    });
    expect(reader.queries).toEqual([]);
  });

  it("lists every month of the year up to the current one, with no figures for a month without vouchers", async () => {
    const reader = new FakeExceptionShareYearReader([FISCAL_ADDRESS]);

    const outcome = await read(reader, at("2026-03-10"), 2026);

    expect(outcome).toEqual({
      kind: "read",
      fiscalAddress: FISCAL_ADDRESS,
      year: 2026,
      selectableYears: [2026, 2025, 2024],
      nonCompliancePercent: 5,
      contingencyNonCompliancePercent: 5,
      months: [
        {
          month: "2026-01",
          exceptionCount: 0,
          totalCount: 0,
          shareTenthsOfPercent: null,
          state: "compliant",
          contingencyTime: NO_DATA,
        },
        {
          month: "2026-02",
          exceptionCount: 0,
          totalCount: 0,
          shareTenthsOfPercent: null,
          state: "compliant",
          contingencyTime: NO_DATA,
        },
        {
          month: "2026-03",
          exceptionCount: 0,
          totalCount: 0,
          shareTenthsOfPercent: null,
          state: "in_progress",
          contingencyTime: NO_DATA,
        },
      ],
      nonCompliantMonths: [],
      contingencyNonCompliantMonths: [],
    });
  });

  it("lists all twelve months of a past year", async () => {
    const reader = new FakeExceptionShareYearReader([FISCAL_ADDRESS]);

    const outcome = await read(reader, at("2026-03-10"), 2025);

    expect(outcome.kind === "read" && outcome.months.map((each) => each.month)).toEqual([
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

  it("answers for the current Argentina calendar year when no year is given", async () => {
    const reader = new FakeExceptionShareYearReader([FISCAL_ADDRESS]);

    const outcome = await read(reader, at("2027-01-05"), undefined);

    expect(outcome.kind === "read" && outcome.year).toBe(2027);
    expect(outcome.kind === "read" && outcome.selectableYears).toEqual([2027, 2026, 2025]);
    expect(reader.queries).toEqual([
      { fiscalAddressId: "fa-1", year: 2027 },
      { fiscalAddressId: "fa-1", year: 2027 },
    ]);
  });

  it("takes the current year from Argentina's calendar, not UTC's", async () => {
    const reader = new FakeExceptionShareYearReader([FISCAL_ADDRESS]);

    const outcome = await read(reader, new Date("2027-01-01T01:00:00Z"), undefined);

    expect(outcome.kind === "read" && outcome.year).toBe(2026);
  });

  it("lists no month of a year that has not started", async () => {
    const reader = new FakeExceptionShareYearReader([FISCAL_ADDRESS]);

    const outcome = await read(reader, at("2026-03-10"), 2027);

    expect(outcome).toEqual({
      kind: "read",
      fiscalAddress: FISCAL_ADDRESS,
      year: 2027,
      selectableYears: [2026, 2025, 2024],
      nonCompliancePercent: 5,
      contingencyNonCompliancePercent: 5,
      months: [],
      nonCompliantMonths: [],
      contingencyNonCompliantMonths: [],
    });
  });

  it("shows the running figure of the open month as in progress, floored in tenths of a percent", async () => {
    const reader = new FakeExceptionShareYearReader(
      [FISCAL_ADDRESS],
      [counts("2026-10", 499, 10_000)],
    );

    const outcome = await read(reader, at("2026-10-31", "23:00"), 2026);

    expect(outcome.kind === "read" && outcome.months.at(-1)).toEqual({
      month: "2026-10",
      exceptionCount: 499,
      totalCount: 10_000,
      shareTenthsOfPercent: 49,
      state: "in_progress",
      contingencyTime: NO_DATA,
    });
  });

  it("keeps an open month in progress even when its running figure reaches the threshold", async () => {
    const reader = new FakeExceptionShareYearReader([FISCAL_ADDRESS], [counts("2026-10", 5, 10)]);

    const outcome = await read(reader, at("2026-10-20"), 2026);

    expect(outcome.kind === "read" && outcome.months.at(-1)?.state).toBe("in_progress");
    expect(outcome.kind === "read" && outcome.nonCompliantMonths).toEqual([]);
  });

  it("shows a closed month under the threshold as compliant", async () => {
    const reader = new FakeExceptionShareYearReader([FISCAL_ADDRESS], [counts("2026-09", 4, 100)]);

    const outcome = await read(reader, at("2026-10-02"), 2026);

    expect(
      outcome.kind === "read" && outcome.months.find((each) => each.month === "2026-09"),
    ).toEqual({
      month: "2026-09",
      exceptionCount: 4,
      totalCount: 100,
      shareTenthsOfPercent: 40,
      state: "compliant",
      contingencyTime: NO_DATA,
    });
  });

  it("shows a recorded month as non-compliant and lists it in order with the year's others", async () => {
    const reader = new FakeExceptionShareYearReader(
      [FISCAL_ADDRESS],
      [counts("2026-02", 5, 100), counts("2026-07", 9, 100), counts("2026-08", 1, 100)],
      ["2026-07", "2026-02"],
    );

    const outcome = await read(reader, at("2026-10-02"), 2026);

    expect(outcome.kind === "read" && outcome.nonCompliantMonths).toEqual(["2026-02", "2026-07"]);
    expect(outcome.kind === "read" && outcome.months.map((each) => each.state)).toEqual([
      "compliant",
      "non_compliant",
      "compliant",
      "compliant",
      "compliant",
      "compliant",
      "non_compliant",
      "compliant",
      "compliant",
      "in_progress",
    ]);
  });

  it("keeps a recorded month non-compliant when later vouchers lowered its share", async () => {
    const reader = new FakeExceptionShareYearReader(
      [FISCAL_ADDRESS],
      [counts("2026-09", 5, 200)],
      ["2026-09"],
    );

    const outcome = await read(reader, at("2026-10-02"), 2026);

    expect(
      outcome.kind === "read" && outcome.months.find((each) => each.month === "2026-09")?.state,
    ).toBe("non_compliant");
  });

  it("asks the reader for the fiscal address and year it was given", async () => {
    const reader = new FakeExceptionShareYearReader([FISCAL_ADDRESS]);

    await read(reader, at("2026-10-02"), 2025);

    expect(reader.queries).toEqual([
      { fiscalAddressId: "fa-1", year: 2025 },
      { fiscalAddressId: "fa-1", year: 2025 },
    ]);
  });

  it("measures each month's contingency time against the time the tax authority's services were available", async () => {
    const reader = new FakeExceptionShareYearReader([FISCAL_ADDRESS]);

    const outcome = await read(reader, at("2026-10-02"), 2026, FISCAL_ADDRESS.id, {
      availability: new FakeArcaAvailabilityReader([availableThroughout("2026-09")]),
      contingency: new FakeContingencyIntervalsReader({
        parts: [inContingency("2026-09", 3)],
        registers: [REPORTING_THROUGHOUT],
      }),
    });

    expect(outcome.kind === "read" && outcome.contingencyNonCompliancePercent).toBe(5);
    expect(
      outcome.kind === "read" && outcome.months.find((each) => each.month === "2026-09"),
    ).toMatchObject({
      contingencyTime: {
        contingencyMs: 3 * 24 * 60 * MINUTE,
        availableMs: 30 * 24 * 60 * MINUTE,
        shareTenthsOfPercent: 100,
        state: "non_compliant",
      },
    });
    expect(
      outcome.kind === "read" && outcome.months.find((each) => each.month === "2026-08"),
    ).toMatchObject({ contingencyTime: NO_DATA });
  });

  it("lists the months non-compliant in time apart from the ones non-compliant by exception, never reconciling them", async () => {
    const reader = new FakeExceptionShareYearReader(
      [FISCAL_ADDRESS],
      [counts("2026-02", 9, 100)],
      ["2026-02"],
    );

    const outcome = await read(reader, at("2026-10-02"), 2026, FISCAL_ADDRESS.id, {
      availability: new FakeArcaAvailabilityReader([
        availableThroughout("2026-09"),
        availableThroughout("2026-02"),
      ]),
      contingency: new FakeContingencyIntervalsReader({
        parts: [inContingency("2026-09", 3)],
        registers: [REPORTING_THROUGHOUT],
      }),
    });

    expect(outcome.kind === "read" && outcome.nonCompliantMonths).toEqual(["2026-02"]);
    expect(outcome.kind === "read" && outcome.contingencyNonCompliantMonths).toEqual(["2026-09"]);
    expect(
      outcome.kind === "read" && outcome.months.find((each) => each.month === "2026-02"),
    ).toMatchObject({ state: "non_compliant", contingencyTime: { state: "compliant" } });
  });

  it("shows a month as without data, with no share, when a register at the address had not started reporting", async () => {
    const reader = new FakeExceptionShareYearReader([FISCAL_ADDRESS]);

    const outcome = await read(reader, at("2026-10-02"), 2026, FISCAL_ADDRESS.id, {
      availability: new FakeArcaAvailabilityReader([availableThroughout("2026-09")]),
      contingency: new FakeContingencyIntervalsReader({
        parts: [inContingency("2026-09", 3)],
        registers: [
          REPORTING_THROUGHOUT,
          { ...REPORTING_THROUGHOUT, registerId: "register-2", reportingSince: null },
        ],
      }),
    });

    expect(
      outcome.kind === "read" && outcome.months.find((each) => each.month === "2026-09"),
    ).toMatchObject({ contingencyTime: { shareTenthsOfPercent: null, state: "no_data" } });
    expect(outcome.kind === "read" && outcome.contingencyNonCompliantMonths).toEqual([]);
  });

  it("measures the month in progress up to now", async () => {
    const reader = new FakeExceptionShareYearReader([FISCAL_ADDRESS]);
    const now = at("2026-10-16");
    const monthStart = monthWindow("2026-10", FIXED_ARGENTINA_ZONE_RULES).start;

    const outcome = await read(reader, now, 2026, FISCAL_ADDRESS.id, {
      availability: new FakeArcaAvailabilityReader([
        { ok: true, firstCheckedAt: monthStart, lastCheckedAt: now },
      ]),
      contingency: new FakeContingencyIntervalsReader({
        parts: [
          {
            registerId: "register-1",
            start: new Date(monthStart.getTime() + 9 * 24 * 60 * MINUTE),
            end: null,
          },
        ],
        registers: [REPORTING_THROUGHOUT],
      }),
    });

    expect(outcome.kind === "read" && outcome.months.at(-1)?.contingencyTime).toEqual({
      contingencyMs: 9_360 * MINUTE,
      availableMs: 22_320 * MINUTE,
      shareTenthsOfPercent: 419,
      state: "in_progress",
    });
    expect(outcome.kind === "read" && outcome.contingencyNonCompliantMonths).toEqual([]);
  });

  it("asks for each listed month's availability and contingency over that month in Argentina's calendar", async () => {
    const reader = new FakeExceptionShareYearReader([FISCAL_ADDRESS]);
    const availability = new FakeArcaAvailabilityReader();
    const contingency = new FakeContingencyIntervalsReader();

    await read(reader, at("2026-03-10"), 2026, FISCAL_ADDRESS.id, { availability, contingency });

    const windows = ["2026-01", "2026-02", "2026-03"].map((month) =>
      monthWindow(month, FIXED_ARGENTINA_ZONE_RULES),
    );
    expect(availability.queries).toEqual(
      windows.map(({ start, end }) => ({ from: start, to: end })),
    );
    expect(contingency.queries).toEqual(
      windows.map(({ start, end }) => ({ fiscalAddressId: "fa-1", from: start, to: end })),
    );
  });

  it("reads neither availability nor contingency for a missing fiscal address or a year that has not started", async () => {
    const availability = new FakeArcaAvailabilityReader();
    const contingency = new FakeContingencyIntervalsReader();

    await read(new FakeExceptionShareYearReader([]), at("2026-03-10"), 2026, "fa-1", {
      availability,
      contingency,
    });
    await read(new FakeExceptionShareYearReader([FISCAL_ADDRESS]), at("2026-03-10"), 2027, "fa-1", {
      availability,
      contingency,
    });

    expect(availability.queries).toEqual([]);
    expect(contingency.queries).toEqual([]);
  });
});
