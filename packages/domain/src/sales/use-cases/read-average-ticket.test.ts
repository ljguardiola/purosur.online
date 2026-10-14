import { describe, expect, it } from "vitest";
import { readAverageTicket } from "./read-average-ticket.js";
import { FakeSalesReportReader } from "./test-support/fake-sales-report-reader.js";

const NOW = new Date("2026-10-06T15:00:00.000Z");
const clock = { now: () => NOW };
const noRange = { from: undefined, to: undefined };

const sold = [
  { day: "2026-09-30", salesCount: 2, total: 4_000 },
  { day: "2026-10-01", salesCount: 2, total: 6_000 },
  { day: "2026-10-04", salesCount: 3, total: 12_000 },
  { day: "2026-10-06", salesCount: 1, total: 3_000 },
];

describe("readAverageTicket", () => {
  it("compares the average ticket of the asked range with the range just before it", async () => {
    const reader = new FakeSalesReportReader(sold);

    const report = await readAverageTicket(
      { reader, clock },
      {
        locationId: "branch-1",
        asked: { from: "2026-10-04", to: "2026-10-06" },
        registerId: undefined,
      },
    );

    expect(report).toEqual({
      range: { from: "2026-10-04", to: "2026-10-06" },
      previousRange: { from: "2026-10-01", to: "2026-10-03" },
      current: { salesCount: 4, total: 15_000, averageTicket: 3_750 },
      previous: { salesCount: 2, total: 6_000, averageTicket: 3_000 },
      changeTenths: 250,
      weeks: [
        {
          from: "2026-10-04",
          to: "2026-10-06",
          salesCount: 4,
          total: 15_000,
          averageTicket: 3_750,
        },
      ],
    });
  });

  it("reads both ranges for the branch and the register asked", async () => {
    const reader = new FakeSalesReportReader();

    await readAverageTicket(
      { reader, clock },
      {
        locationId: "branch-1",
        asked: { from: "2026-10-04", to: "2026-10-06" },
        registerId: "register-2",
      },
    );

    expect(reader.salesByDayReads).toEqual([
      {
        locationId: "branch-1",
        range: { from: "2026-10-04", to: "2026-10-06" },
        registerId: "register-2",
      },
      {
        locationId: "branch-1",
        range: { from: "2026-10-01", to: "2026-10-03" },
        registerId: "register-2",
      },
    ]);
  });

  it("asks for the current day of the clock and the day before it when no range is asked", async () => {
    const reader = new FakeSalesReportReader(sold);

    const report = await readAverageTicket(
      { reader, clock },
      { locationId: "branch-1", asked: noRange, registerId: undefined },
    );

    expect(report.range).toEqual({ from: "2026-10-06", to: "2026-10-06" });
    expect(report.previousRange).toEqual({ from: "2026-10-05", to: "2026-10-05" });
    expect(report.current.averageTicket).toBe(3_000);
    expect(report.previous).toEqual({ salesCount: 0, total: 0, averageTicket: null });
    expect(report.changeTenths).toBeNull();
  });

  it("has no change when the asked range has no sales", async () => {
    const report = await readAverageTicket(
      { reader: new FakeSalesReportReader(sold), clock },
      {
        locationId: "branch-1",
        asked: { from: "2026-10-02", to: "2026-10-03" },
        registerId: undefined,
      },
    );

    expect(report.current).toEqual({ salesCount: 0, total: 0, averageTicket: null });
    expect(report.changeTenths).toBeNull();
  });

  it("cuts the asked range into weeks counted back from its last day", async () => {
    const report = await readAverageTicket(
      { reader: new FakeSalesReportReader(sold), clock },
      {
        locationId: "branch-1",
        asked: { from: "2026-09-30", to: "2026-10-09" },
        registerId: undefined,
      },
    );

    expect(report.weeks.map(({ from, to }) => [from, to])).toEqual([
      ["2026-10-03", "2026-10-09"],
      ["2026-09-30", "2026-10-02"],
    ]);
  });
});
