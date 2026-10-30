import { describe, expect, it } from "vitest";
import {
  FakeZoneRulesSource,
  fixedOffsetZoneRules,
} from "../../shared/test-support/fake-zone-rules-source.js";
import { anAiCall } from "../model/test-support/recorded-ai-call.js";
import { readAiCostByPeriod } from "./read-ai-cost-by-period.js";
import { FakeAiCostReportReader } from "./test-support/fake-ai-cost-readers.js";

const clock = { now: () => new Date("2026-10-06T15:00:00.000Z") };
const noRange = { from: undefined, to: undefined };

describe("readAiCostByPeriod", () => {
  it("reads the calls of the asked range for the branch and groups them as asked", async () => {
    const reader = new FakeAiCostReportReader([
      anAiCall({ supplierId: "s-1", supplierName: "Alfa", costNanoUsd: 50 }),
      anAiCall({ supplierId: "s-2", supplierName: "Beta", costNanoUsd: 500 }),
      anAiCall({
        supplierId: "s-2",
        supplierName: "Beta",
        purpose: "LINK_PROPOSAL",
        costNanoUsd: 5,
      }),
    ]);

    const report = await readAiCostByPeriod(
      { zoneRules: new FakeZoneRulesSource(), reader, clock },
      {
        locationId: "branch-1",
        asked: { from: "2026-10-01", to: "2026-10-06" },
        groupBy: "supplier",
      },
    );

    expect(report.range).toEqual({ from: "2026-10-01", to: "2026-10-06" });
    expect(report.groups.map(({ key, name, total }) => [key, name, total.costNanoUsd])).toEqual([
      ["s-2", "Beta", 505],
      ["s-1", "Alfa", 50],
    ]);
    expect(report.total).toEqual({
      reading: { costNanoUsd: 550, unpricedCalls: 0 },
      proposals: { costNanoUsd: 5, unpricedCalls: 0 },
      total: { costNanoUsd: 555, unpricedCalls: 0 },
    });
    expect(reader.reads).toEqual([
      { locationId: "branch-1", range: { from: "2026-10-01", to: "2026-10-06" } },
    ]);
  });

  it.each([
    ["day", "2026-10-06"],
    ["person", "person-1"],
  ] as const)("groups by %s", async (groupBy, key) => {
    const reader = new FakeAiCostReportReader([anAiCall()]);

    const report = await readAiCostByPeriod(
      { zoneRules: new FakeZoneRulesSource(), reader, clock },
      { locationId: "branch-1", asked: noRange, groupBy },
    );

    expect(report.groups.map((group) => group.key)).toEqual([key]);
  });

  it("asks for the current day in Argentina when no range is asked", async () => {
    const reader = new FakeAiCostReportReader();

    const report = await readAiCostByPeriod(
      {
        zoneRules: new FakeZoneRulesSource(),
        reader,
        clock: { now: () => new Date("2026-10-07T01:30:00.000Z") },
      },
      { locationId: "branch-1", asked: noRange, groupBy: "day" },
    );

    expect(report.range).toEqual({ from: "2026-10-06", to: "2026-10-06" });
    expect(reader.reads[0]?.range).toEqual({ from: "2026-10-06", to: "2026-10-06" });
  });

  it("asks for the current day on the calendar of the zone rules it is given", async () => {
    const report = await readAiCostByPeriod(
      {
        reader: new FakeAiCostReportReader(),
        clock: { now: () => new Date("2026-10-07T01:30:00.000Z") },
        zoneRules: new FakeZoneRulesSource(fixedOffsetZoneRules(0)),
      },
      { locationId: "branch-1", asked: noRange, groupBy: "day" },
    );

    expect(report.range).toEqual({ from: "2026-10-07", to: "2026-10-07" });
  });

  it("reports no groups and a zero total when nothing was recorded", async () => {
    const report = await readAiCostByPeriod(
      { zoneRules: new FakeZoneRulesSource(), reader: new FakeAiCostReportReader(), clock },
      { locationId: "branch-1", asked: noRange, groupBy: "person" },
    );

    expect(report.groups).toEqual([]);
    expect(report.total.total).toEqual({ costNanoUsd: 0, unpricedCalls: 0 });
  });
});
