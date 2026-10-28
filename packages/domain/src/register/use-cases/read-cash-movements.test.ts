import { describe, expect, it } from "vitest";
import {
  FakeZoneRulesSource,
  fixedOffsetZoneRules,
} from "../../shared/test-support/fake-zone-rules-source.js";
import type { ReportedCashMovement } from "../model/cash-movements-report.js";
import { readCashMovements } from "./read-cash-movements.js";
import { FakeCashMovementsReader } from "./test-support/fake-cash-movements-reader.js";

const NOW = new Date("2026-10-06T15:00:00.000Z");
const clock = { now: () => NOW };
const noRange = { from: undefined, to: undefined };

function aMovement(overrides: Partial<ReportedCashMovement> = {}): ReportedCashMovement {
  return {
    id: "movement-1",
    occurredAt: new Date("2026-10-06T14:00:00.000Z"),
    kind: "CASH_OUT",
    reason: "Compra de hielo",
    amount: 800,
    sessionId: "session-1",
    registerName: "Caja 1",
    sessionOpenedAt: new Date("2026-10-06T11:00:00.000Z"),
    ...overrides,
  };
}

describe("readCashMovements", () => {
  it("reads the movements of the asked range for the branch and summarizes them", async () => {
    const reader = new FakeCashMovementsReader([
      aMovement({ id: "a", occurredAt: new Date("2026-10-05T14:00:00.000Z"), kind: "CASH_IN" }),
      aMovement({ id: "b" }),
    ]);

    const report = await readCashMovements(
      { zoneRules: new FakeZoneRulesSource(), reader, clock },
      {
        locationId: "branch-1",
        asked: { from: "2026-10-01", to: "2026-10-06" },
        registerId: undefined,
      },
    );

    expect(report.range).toEqual({ from: "2026-10-01", to: "2026-10-06" });
    expect(report.movements.map(({ id }) => id)).toEqual(["b", "a"]);
    expect(report.totals.CASH_IN).toEqual({ movements: 1, amount: 800 });
    expect(report.totals.CASH_OUT).toEqual({ movements: 1, amount: 800 });
    expect(reader.reads).toEqual([
      {
        locationId: "branch-1",
        range: { from: "2026-10-01", to: "2026-10-06" },
        registerId: undefined,
      },
    ]);
  });

  it("asks for the current day in Argentina when no range is asked", async () => {
    const reader = new FakeCashMovementsReader();

    const report = await readCashMovements(
      {
        zoneRules: new FakeZoneRulesSource(),
        reader,
        clock: { now: () => new Date("2026-10-07T01:30:00.000Z") },
      },
      { locationId: "branch-1", asked: noRange, registerId: undefined },
    );

    expect(report.range).toEqual({ from: "2026-10-06", to: "2026-10-06" });
    expect(reader.reads[0]?.range).toEqual({ from: "2026-10-06", to: "2026-10-06" });
  });

  it("asks for the current day on the calendar of the zone rules it is given", async () => {
    const reader = new FakeCashMovementsReader();

    const report = await readCashMovements(
      {
        reader,
        clock: { now: () => new Date("2026-10-07T01:30:00.000Z") },
        zoneRules: new FakeZoneRulesSource(fixedOffsetZoneRules(0)),
      },
      { locationId: "branch-1", asked: noRange, registerId: undefined },
    );

    expect(report.range).toEqual({ from: "2026-10-07", to: "2026-10-07" });
  });

  it("limits the read to the asked register", async () => {
    const reader = new FakeCashMovementsReader();

    await readCashMovements(
      { zoneRules: new FakeZoneRulesSource(), reader, clock },
      { locationId: "branch-1", asked: noRange, registerId: "register-2" },
    );

    expect(reader.reads[0]).toMatchObject({ registerId: "register-2" });
  });

  it("reports empty totals for a range without movements", async () => {
    const report = await readCashMovements(
      { zoneRules: new FakeZoneRulesSource(), reader: new FakeCashMovementsReader(), clock },
      { locationId: "branch-1", asked: noRange, registerId: undefined },
    );

    expect(report.movements).toEqual([]);
    expect(report.totals.WITHDRAWAL).toEqual({ movements: 0, amount: 0 });
  });
});
