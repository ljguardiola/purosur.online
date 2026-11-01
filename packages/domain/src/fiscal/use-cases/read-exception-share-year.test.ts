import { describe, expect, it } from "vitest";
import { argentinaInstant, FIXED_ARGENTINA_ZONE_RULES } from "../../shared/index.js";
import { FakeZoneRulesSource } from "../../shared/test-support/fake-zone-rules-source.js";
import { readExceptionShareYear } from "./read-exception-share-year.js";
import type { MonthlyVoucherCounts } from "./read-exception-share-year-ports.js";
import { FakeExceptionShareYearReader } from "./test-support/fake-exception-share-year-reader.js";
import { FixedClock } from "./test-support/fixed-clock.js";

const FISCAL_ADDRESS = { id: "fa-1", name: "Local central" };

function at(day: string, time = "12:00"): Date {
  return new Date(argentinaInstant(day, time, FIXED_ARGENTINA_ZONE_RULES));
}

function counts(month: string, exceptionCount: number, totalCount: number): MonthlyVoucherCounts {
  return { month, exceptionCount, totalCount };
}

async function read(
  reader: FakeExceptionShareYearReader,
  now: Date,
  year: number | undefined,
  fiscalAddressId = FISCAL_ADDRESS.id,
) {
  return readExceptionShareYear(
    { reader, clock: new FixedClock(now), zoneRules: new FakeZoneRulesSource() },
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
      months: [
        {
          month: "2026-01",
          exceptionCount: 0,
          totalCount: 0,
          shareTenthsOfPercent: null,
          state: "compliant",
        },
        {
          month: "2026-02",
          exceptionCount: 0,
          totalCount: 0,
          shareTenthsOfPercent: null,
          state: "compliant",
        },
        {
          month: "2026-03",
          exceptionCount: 0,
          totalCount: 0,
          shareTenthsOfPercent: null,
          state: "in_progress",
        },
      ],
      nonCompliantMonths: [],
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
      months: [],
      nonCompliantMonths: [],
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
});
