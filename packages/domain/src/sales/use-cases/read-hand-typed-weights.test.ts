import { describe, expect, it } from "vitest";
import { FakeZoneRulesSource } from "../../shared/test-support/fake-zone-rules-source.js";
import type { WeighedLinesGroup } from "../model/hand-typed-weights-report.js";
import { readHandTypedWeights } from "./read-hand-typed-weights.js";
import { FakeHandTypedWeightsReportReader } from "./test-support/fake-hand-typed-weights-report-reader.js";

const NOW = new Date("2026-10-06T15:00:00.000Z");
const clock = { now: () => NOW };
const noRange = { from: undefined, to: undefined };
const OPENED_AT = new Date("2026-10-06T11:00:00.000Z");

const groups: WeighedLinesGroup[] = [
  {
    sessionId: "s1",
    registerName: "Caja 1",
    openedAt: OPENED_AT,
    cashierId: "u1",
    cashierName: "Ana",
    weightSource: "SCALE",
    lines: 4,
  },
  {
    sessionId: "s1",
    registerName: "Caja 1",
    openedAt: OPENED_AT,
    cashierId: "u1",
    cashierName: "Ana",
    weightSource: "MANUAL",
    lines: 1,
  },
  {
    sessionId: "s1",
    registerName: "Caja 1",
    openedAt: OPENED_AT,
    cashierId: "u2",
    cashierName: null,
    weightSource: "MANUAL",
    lines: 2,
  },
];

describe("readHandTypedWeights", () => {
  it("counts the weighed lines of the asked range by cashier and by session", async () => {
    const reader = new FakeHandTypedWeightsReportReader(groups);

    const report = await readHandTypedWeights(
      { zoneRules: new FakeZoneRulesSource(), reader, clock },
      {
        locationId: "branch-1",
        asked: { from: "2026-10-01", to: "2026-10-06" },
        registerId: undefined,
      },
    );

    expect(report).toEqual({
      range: { from: "2026-10-01", to: "2026-10-06" },
      cashiers: [
        { cashierId: "u2", name: null, weighedLines: 2, typedLines: 2 },
        { cashierId: "u1", name: "Ana", weighedLines: 5, typedLines: 1 },
      ],
      sessions: [
        {
          sessionId: "s1",
          registerName: "Caja 1",
          openedAt: OPENED_AT,
          weighedLines: 7,
          typedLines: 3,
        },
      ],
      totals: { weighedLines: 7, typedLines: 3 },
    });
    expect(reader.reads).toEqual([
      {
        locationId: "branch-1",
        range: { from: "2026-10-01", to: "2026-10-06" },
        registerId: undefined,
      },
    ]);
  });

  it("asks for the current day of the clock when no range is asked", async () => {
    const reader = new FakeHandTypedWeightsReportReader();

    const report = await readHandTypedWeights(
      { zoneRules: new FakeZoneRulesSource(), reader, clock },
      { locationId: "branch-1", asked: noRange, registerId: undefined },
    );

    expect(report.range).toEqual({ from: "2026-10-06", to: "2026-10-06" });
    expect(reader.reads[0]?.range).toEqual({ from: "2026-10-06", to: "2026-10-06" });
  });

  it("limits the read to the asked register", async () => {
    const reader = new FakeHandTypedWeightsReportReader();

    await readHandTypedWeights(
      { zoneRules: new FakeZoneRulesSource(), reader, clock },
      { locationId: "branch-1", asked: noRange, registerId: "register-2" },
    );

    expect(reader.reads[0]?.registerId).toBe("register-2");
  });

  it("reports nothing and zero totals for a range without weighed lines", async () => {
    const report = await readHandTypedWeights(
      {
        zoneRules: new FakeZoneRulesSource(),
        reader: new FakeHandTypedWeightsReportReader(),
        clock,
      },
      { locationId: "branch-1", asked: noRange, registerId: undefined },
    );

    expect(report.cashiers).toEqual([]);
    expect(report.sessions).toEqual([]);
    expect(report.totals).toEqual({ weighedLines: 0, typedLines: 0 });
  });
});
