import { describe, expect, it } from "vitest";
import {
  FakeZoneRulesSource,
  fixedOffsetZoneRules,
} from "../../shared/test-support/fake-zone-rules-source.js";
import type { CashSessionClose } from "../model/cash-session-closes.js";
import { readCashSessionCloses } from "./read-cash-session-closes.js";
import { FakeCashSessionClosesReader } from "./test-support/fake-cash-session-closes-reader.js";

const NOW = new Date("2026-10-06T15:00:00.000Z");
const clock = { now: () => NOW };
const noRange = { from: undefined, to: undefined };

function aClose(overrides: Partial<CashSessionClose> = {}): CashSessionClose {
  return {
    id: "session-1",
    closedAt: new Date("2026-10-06T14:00:00.000Z"),
    registerId: "register-1",
    registerName: "Caja 1",
    cashierId: "cashier-1",
    cashierName: "Ana",
    closedById: "cashier-1",
    closedByName: "Ana",
    expectedCash: 10_000,
    countedCash: 9_500,
    difference: -500,
    ...overrides,
  };
}

describe("readCashSessionCloses", () => {
  it("reads the closes of the asked range for the branch and summarizes them", async () => {
    const reader = new FakeCashSessionClosesReader([
      aClose({ id: "a", closedAt: new Date("2026-10-05T14:00:00.000Z") }),
      aClose({ id: "b", difference: 0 }),
    ]);

    const report = await readCashSessionCloses(
      { reader, clock },
      {
        locationId: "branch-1",
        asked: { from: "2026-10-01", to: "2026-10-06" },
        registerId: undefined,
      },
    );

    expect(report.range).toEqual({ from: "2026-10-01", to: "2026-10-06" });
    expect(report.closes.map(({ id }) => id)).toEqual(["b", "a"]);
    expect(report.totals).toMatchObject({ sessions: 2, netDifference: -500, withDifference: 1 });
    expect(reader.reads).toEqual([
      {
        locationId: "branch-1",
        range: { from: "2026-10-01", to: "2026-10-06" },
        registerId: undefined,
      },
    ]);
  });

  it("asks for the current day in Argentina when no range is asked", async () => {
    const reader = new FakeCashSessionClosesReader();

    const report = await readCashSessionCloses(
      { reader, clock: { now: () => new Date("2026-10-07T01:30:00.000Z") } },
      { locationId: "branch-1", asked: noRange, registerId: undefined },
    );

    expect(report.range).toEqual({ from: "2026-10-06", to: "2026-10-06" });
    expect(reader.reads[0]?.range).toEqual({ from: "2026-10-06", to: "2026-10-06" });
  });

  it("asks for the current day on the calendar of the zone rules it is given", async () => {
    const reader = new FakeCashSessionClosesReader();

    const report = await readCashSessionCloses(
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
    const reader = new FakeCashSessionClosesReader();

    await readCashSessionCloses(
      { reader, clock },
      { locationId: "branch-1", asked: noRange, registerId: "register-2" },
    );

    expect(reader.reads[0]).toMatchObject({ registerId: "register-2" });
  });

  it("reports empty totals for a range without closes", async () => {
    const report = await readCashSessionCloses(
      { reader: new FakeCashSessionClosesReader(), clock },
      { locationId: "branch-1", asked: noRange, registerId: undefined },
    );

    expect(report.closes).toEqual([]);
    expect(report.totals).toEqual({
      sessions: 0,
      netDifference: 0,
      withDifference: 0,
      cashiersWithDifference: [],
    });
  });
});
