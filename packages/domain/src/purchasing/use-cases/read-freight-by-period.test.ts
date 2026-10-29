import { describe, expect, it } from "vitest";
import {
  FakeZoneRulesSource,
  fixedOffsetZoneRules,
} from "../../shared/test-support/fake-zone-rules-source.js";
import { aFreight } from "../model/test-support/registered-freight.js";
import { readFreightByPeriod } from "./read-freight-by-period.js";
import { FakeFreightReportReader } from "./test-support/fake-freight-report-reader.js";

const clock = { now: () => new Date("2026-10-06T15:00:00.000Z") };
const noRange = { from: undefined, to: undefined };

describe("readFreightByPeriod", () => {
  it("reads the freight of the asked range for the branch and groups it by month", async () => {
    const reader = new FakeFreightReportReader([
      aFreight({ freightOn: "2026-09-30", amountCents: 4_000 }),
      aFreight({ amountCents: 500 }),
    ]);

    const report = await readFreightByPeriod(
      { zoneRules: new FakeZoneRulesSource(), reader, clock },
      { locationId: "branch-1", asked: { from: "2026-09-01", to: "2026-10-06" } },
    );

    expect(report.range).toEqual({ from: "2026-09-01", to: "2026-10-06" });
    expect(report.months).toEqual([
      { month: "2026-09", freights: 1, amount: 4_000 },
      { month: "2026-10", freights: 1, amount: 500 },
    ]);
    expect(report.totals).toEqual({ freights: 2, amount: 4_500 });
    expect(reader.reads).toEqual([
      { locationId: "branch-1", range: { from: "2026-09-01", to: "2026-10-06" } },
    ]);
  });

  it("asks for the current day in Argentina when no range is asked", async () => {
    const reader = new FakeFreightReportReader();

    const report = await readFreightByPeriod(
      {
        zoneRules: new FakeZoneRulesSource(),
        reader,
        clock: { now: () => new Date("2026-10-07T01:30:00.000Z") },
      },
      { locationId: "branch-1", asked: noRange },
    );

    expect(report.range).toEqual({ from: "2026-10-06", to: "2026-10-06" });
    expect(reader.reads[0]?.range).toEqual({ from: "2026-10-06", to: "2026-10-06" });
  });

  it("asks for the current day on the calendar of the zone rules it is given", async () => {
    const report = await readFreightByPeriod(
      {
        reader: new FakeFreightReportReader(),
        clock: { now: () => new Date("2026-10-07T01:30:00.000Z") },
        zoneRules: new FakeZoneRulesSource(fixedOffsetZoneRules(0)),
      },
      { locationId: "branch-1", asked: noRange },
    );

    expect(report.range).toEqual({ from: "2026-10-07", to: "2026-10-07" });
  });

  it("reports no months and zero totals for a range without freight", async () => {
    const report = await readFreightByPeriod(
      { zoneRules: new FakeZoneRulesSource(), reader: new FakeFreightReportReader(), clock },
      { locationId: "branch-1", asked: noRange },
    );

    expect(report.months).toEqual([]);
    expect(report.totals).toEqual({ freights: 0, amount: 0 });
  });
});
