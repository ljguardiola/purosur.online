import { describe, expect, it } from "vitest";
import { FakeZoneRulesSource } from "../../shared/test-support/fake-zone-rules-source.js";
import { readCashRounding } from "./read-cash-rounding.js";
import { FakeCashRoundingReportReader } from "./test-support/fake-cash-rounding-report-reader.js";

const NOW = new Date("2026-10-06T15:00:00.000Z");
const clock = { now: () => NOW };
const noRange = { from: undefined, to: undefined };

const roundedOn = (day: string, registerId: string, registerName: string, rounded: number) => ({
  day,
  registerId,
  registerName,
  rounded,
  roundedSaleCount: 2,
});

describe("readCashRounding", () => {
  it("reads the rounding of the asked range, ordered by day and register, and totals it", async () => {
    const reader = new FakeCashRoundingReportReader([
      roundedOn("2026-10-06", "r2", "Caja 2", 70),
      roundedOn("2026-10-04", "r1", "Caja 1", 30),
      roundedOn("2026-10-06", "r1", "Caja 1", 150),
    ]);

    const report = await readCashRounding(
      { zoneRules: new FakeZoneRulesSource(), reader, clock },
      {
        locationId: "branch-1",
        asked: { from: "2026-10-01", to: "2026-10-06" },
        registerId: undefined,
      },
    );

    expect(report).toEqual({
      range: { from: "2026-10-01", to: "2026-10-06" },
      rows: [
        roundedOn("2026-10-04", "r1", "Caja 1", 30),
        roundedOn("2026-10-06", "r1", "Caja 1", 150),
        roundedOn("2026-10-06", "r2", "Caja 2", 70),
      ],
      totals: { rounded: 250, roundedSaleCount: 6 },
    });
    expect(reader.reads).toEqual([
      {
        locationId: "branch-1",
        range: { from: "2026-10-01", to: "2026-10-06" },
        registerId: undefined,
      },
    ]);
  });

  it("asks for the register it was given", async () => {
    const reader = new FakeCashRoundingReportReader([
      roundedOn("2026-10-06", "r1", "Caja 1", 150),
      roundedOn("2026-10-06", "r2", "Caja 2", 70),
    ]);

    const report = await readCashRounding(
      { zoneRules: new FakeZoneRulesSource(), reader, clock },
      { locationId: "branch-1", asked: noRange, registerId: "r2" },
    );

    expect(reader.reads.map((read) => read.registerId)).toEqual(["r2"]);
    expect(report.rows.map((row) => row.registerId)).toEqual(["r2"]);
  });

  it("defaults the range when none is asked", async () => {
    const reader = new FakeCashRoundingReportReader();

    const report = await readCashRounding(
      { zoneRules: new FakeZoneRulesSource(), reader, clock },
      { locationId: "branch-1", asked: noRange, registerId: undefined },
    );

    expect(report.range.to).toBe("2026-10-06");
    expect(reader.reads[0]?.range).toEqual(report.range);
  });

  it("reports no rows and zero totals for a period without rounding", async () => {
    const report = await readCashRounding(
      { zoneRules: new FakeZoneRulesSource(), reader: new FakeCashRoundingReportReader(), clock },
      { locationId: "branch-1", asked: noRange, registerId: undefined },
    );

    expect(report.rows).toEqual([]);
    expect(report.totals).toEqual({ rounded: 0, roundedSaleCount: 0 });
  });
});
