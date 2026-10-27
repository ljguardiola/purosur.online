import { describe, expect, it } from "vitest";
import {
  FakeZoneRulesSource,
  fixedOffsetZoneRules,
} from "../../shared/test-support/fake-zone-rules-source.js";
import type { LossRecord } from "../model/losses-by-reason.js";
import { readLossesByReasonReport } from "./read-losses-by-reason-report.js";
import { FakeLossReader } from "./test-support/fake-loss-reader.js";

const clock = { now: () => new Date("2026-10-07T02:30:00.000Z") };
const noRange = { from: undefined, to: undefined };

function loss(overrides: Partial<LossRecord> = {}): LossRecord {
  return {
    reason: "spoiled",
    product: { id: "p1", name: "Yerba", saleUnit: "UNIT" },
    quantity: 2_000,
    ...overrides,
  };
}

describe("readLossesByReasonReport", () => {
  it("reads the branch and range asked and answers with that range", async () => {
    const reader = new FakeLossReader();

    const report = await readLossesByReasonReport(
      { reader, clock, zoneRules: new FakeZoneRulesSource() },
      { locationId: "branch-1", asked: { from: "2026-10-01", to: "2026-10-06" } },
    );

    expect(report.range).toEqual({ from: "2026-10-01", to: "2026-10-06" });
    expect(reader.reads).toEqual([
      { locationId: "branch-1", range: { from: "2026-10-01", to: "2026-10-06" } },
    ]);
  });

  it("answers today's Argentine day when no range is asked", async () => {
    const report = await readLossesByReasonReport(
      { reader: new FakeLossReader(), clock, zoneRules: new FakeZoneRulesSource() },
      { locationId: "branch-1", asked: noRange },
    );

    expect(report.range).toEqual({ from: "2026-10-06", to: "2026-10-06" });
  });

  it("answers today on the calendar of the zone rules it is given", async () => {
    const report = await readLossesByReasonReport(
      {
        reader: new FakeLossReader(),
        clock,
        zoneRules: new FakeZoneRulesSource(fixedOffsetZoneRules(0)),
      },
      { locationId: "branch-1", asked: noRange },
    );

    expect(report.range).toEqual({ from: "2026-10-07", to: "2026-10-07" });
  });

  it("groups the losses read by reason, the ones the system assigns beside the hand-recorded", async () => {
    const reader = new FakeLossReader([
      loss({ reason: "return_discard", quantity: 500 }),
      loss({ quantity: 1_000 }),
      loss({ quantity: 2_000 }),
    ]);

    const report = await readLossesByReasonReport(
      { reader, clock, zoneRules: new FakeZoneRulesSource() },
      { locationId: "branch-1", asked: noRange },
    );

    expect(report.reasons).toEqual([
      {
        reason: "spoiled",
        lossCount: 2,
        products: [{ id: "p1", name: "Yerba", saleUnit: "UNIT", quantity: 3_000, lossCount: 2 }],
      },
      {
        reason: "return_discard",
        lossCount: 1,
        products: [{ id: "p1", name: "Yerba", saleUnit: "UNIT", quantity: 500, lossCount: 1 }],
      },
    ]);
  });

  it("answers no reason when nothing was lost", async () => {
    const report = await readLossesByReasonReport(
      { reader: new FakeLossReader(), clock, zoneRules: new FakeZoneRulesSource() },
      { locationId: "branch-1", asked: noRange },
    );

    expect(report.reasons).toEqual([]);
  });
});
