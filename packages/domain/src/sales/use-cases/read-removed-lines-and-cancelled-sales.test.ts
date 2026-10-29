import { describe, expect, it } from "vitest";
import { FakeZoneRulesSource } from "../../shared/test-support/fake-zone-rules-source.js";
import type { RemovalFacts } from "../model/removed-lines-and-cancelled-sales-report.js";
import { readRemovedLinesAndCancelledSales } from "./read-removed-lines-and-cancelled-sales.js";
import { FakeRemovedLinesAndCancelledSalesReportReader } from "./test-support/fake-removed-lines-and-cancelled-sales-report-reader.js";

const NOW = new Date("2026-10-06T15:00:00.000Z");
const clock = { now: () => NOW };
const noRange = { from: undefined, to: undefined };
const OPENED_AT = new Date("2026-10-06T11:00:00.000Z");

const facts: RemovalFacts = {
  removedLines: [
    {
      sessionId: "s1",
      registerName: "Caja 1",
      openedAt: OPENED_AT,
      cashierId: "u1",
      cashierName: "Ana",
      weightSource: null,
      lines: 2,
      quantity: 3,
      amount: 600,
    },
  ],
  cancelledSales: [
    {
      saleId: "v1",
      sessionId: "s1",
      registerName: "Caja 1",
      openedAt: OPENED_AT,
      cashierId: "u1",
      cashierName: "Ana",
      total: 400,
      paymentStates: ["DECLINED"],
      lines: [{ weightSource: "SCALE", quantity: 800 }],
    },
    {
      saleId: "v2",
      sessionId: "s1",
      registerName: "Caja 1",
      openedAt: OPENED_AT,
      cashierId: "u1",
      cashierName: "Ana",
      total: 900,
      paymentStates: ["APPROVED"],
      lines: [{ weightSource: null, quantity: 9 }],
    },
  ],
};

describe("readRemovedLinesAndCancelledSales", () => {
  it("tallies what the asked range removed and cancelled by cashier and by session", async () => {
    const reader = new FakeRemovedLinesAndCancelledSalesReportReader(facts);

    const report = await readRemovedLinesAndCancelledSales(
      { zoneRules: new FakeZoneRulesSource(), reader, clock },
      {
        locationId: "branch-1",
        asked: { from: "2026-10-01", to: "2026-10-06" },
        registerId: undefined,
      },
    );

    const removed = { lines: 2, units: 3, thousandths: 0, amount: 600 };
    const cancelled = { sales: 1, units: 0, thousandths: 800, amount: 400 };
    expect(report).toEqual({
      range: { from: "2026-10-01", to: "2026-10-06" },
      cashiers: [{ cashierId: "u1", name: "Ana", removed, cancelled }],
      sessions: [
        { sessionId: "s1", registerName: "Caja 1", openedAt: OPENED_AT, removed, cancelled },
      ],
      totals: { removed, cancelled },
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
    const reader = new FakeRemovedLinesAndCancelledSalesReportReader();

    const report = await readRemovedLinesAndCancelledSales(
      { zoneRules: new FakeZoneRulesSource(), reader, clock },
      { locationId: "branch-1", asked: noRange, registerId: undefined },
    );

    expect(report.range).toEqual({ from: "2026-10-06", to: "2026-10-06" });
    expect(reader.reads[0]?.range).toEqual({ from: "2026-10-06", to: "2026-10-06" });
  });

  it("limits the read to the asked register", async () => {
    const reader = new FakeRemovedLinesAndCancelledSalesReportReader();

    await readRemovedLinesAndCancelledSales(
      { zoneRules: new FakeZoneRulesSource(), reader, clock },
      { locationId: "branch-1", asked: noRange, registerId: "register-2" },
    );

    expect(reader.reads[0]?.registerId).toBe("register-2");
  });

  it("reports nothing and zero totals for a range without removals or cancellations", async () => {
    const report = await readRemovedLinesAndCancelledSales(
      {
        zoneRules: new FakeZoneRulesSource(),
        reader: new FakeRemovedLinesAndCancelledSalesReportReader(),
        clock,
      },
      { locationId: "branch-1", asked: noRange, registerId: undefined },
    );

    expect(report.cashiers).toEqual([]);
    expect(report.sessions).toEqual([]);
    expect(report.totals).toEqual({
      removed: { lines: 0, units: 0, thousandths: 0, amount: 0 },
      cancelled: { sales: 0, units: 0, thousandths: 0, amount: 0 },
    });
  });
});
