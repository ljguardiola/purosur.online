import { describe, expect, it } from "vitest";
import { readSalesByDay } from "./read-sales-by-day.js";
import { FakeSalesReportReader } from "./test-support/fake-sales-report-reader.js";

const NOW = new Date("2026-10-06T15:00:00.000Z");
const clock = { now: () => NOW };
const noRange = { from: undefined, to: undefined };

describe("readSalesByDay", () => {
  it("reads the days of the asked range for the branch and totals them", async () => {
    const reader = new FakeSalesReportReader([
      { day: "2026-10-04", salesCount: 3, total: 12_500 },
      { day: "2026-10-06", salesCount: 2, total: 4_800 },
    ]);

    const report = await readSalesByDay(
      { reader, clock },
      {
        locationId: "branch-1",
        asked: { from: "2026-10-01", to: "2026-10-06" },
        registerId: undefined,
      },
    );

    expect(report).toEqual({
      range: { from: "2026-10-01", to: "2026-10-06" },
      days: [
        { day: "2026-10-04", salesCount: 3, total: 12_500 },
        { day: "2026-10-06", salesCount: 2, total: 4_800 },
      ],
      totals: { salesCount: 5, total: 17_300 },
    });
    expect(reader.salesByDayReads).toEqual([
      {
        locationId: "branch-1",
        range: { from: "2026-10-01", to: "2026-10-06" },
        registerId: undefined,
      },
    ]);
  });

  it("asks for the current day of the clock when no range is asked", async () => {
    const reader = new FakeSalesReportReader();

    const report = await readSalesByDay(
      { reader, clock },
      { locationId: "branch-1", asked: noRange, registerId: undefined },
    );

    expect(report.range).toEqual({ from: "2026-10-06", to: "2026-10-06" });
    expect(reader.salesByDayReads[0]?.range).toEqual({ from: "2026-10-06", to: "2026-10-06" });
  });

  it("resolves the current day in Argentina, not in UTC", async () => {
    const reader = new FakeSalesReportReader();

    const report = await readSalesByDay(
      { reader, clock: { now: () => new Date("2026-10-07T01:30:00.000Z") } },
      { locationId: "branch-1", asked: noRange, registerId: undefined },
    );

    expect(report.range).toEqual({ from: "2026-10-06", to: "2026-10-06" });
  });

  it("limits the read to the asked register", async () => {
    const reader = new FakeSalesReportReader();

    await readSalesByDay(
      { reader, clock },
      { locationId: "branch-1", asked: noRange, registerId: "register-2" },
    );

    expect(reader.salesByDayReads[0]?.registerId).toBe("register-2");
  });

  it("reports no sales and zero totals for a range without sales", async () => {
    const report = await readSalesByDay(
      { reader: new FakeSalesReportReader(), clock },
      { locationId: "branch-1", asked: noRange, registerId: undefined },
    );

    expect(report.days).toEqual([]);
    expect(report.totals).toEqual({ salesCount: 0, total: 0 });
  });
});
