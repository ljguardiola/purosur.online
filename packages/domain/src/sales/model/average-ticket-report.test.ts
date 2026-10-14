import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { previousReportPeriod, salesOfWeeks, ticketChangeTenths } from "./average-ticket-report.js";

const dayCount = ({ from, to }: { from: string; to: string }) =>
  (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;

const calendarDays = fc
  .integer({ min: Date.parse("2000-01-01T00:00:00Z"), max: Date.parse("2040-12-31T00:00:00Z") })
  .map((ms) => new Date(ms - (ms % 86_400_000)).toISOString().slice(0, 10));

describe("previousReportPeriod", () => {
  it("is the day before a single day", () => {
    expect(previousReportPeriod({ from: "2026-10-06", to: "2026-10-06" })).toEqual({
      from: "2026-10-05",
      to: "2026-10-05",
    });
  });

  it("is the range of the same length that ends the day before the range starts", () => {
    expect(previousReportPeriod({ from: "2026-10-08", to: "2026-10-14" })).toEqual({
      from: "2026-10-01",
      to: "2026-10-07",
    });
  });

  it("crosses a month and a leap day", () => {
    expect(previousReportPeriod({ from: "2028-03-01", to: "2028-03-03" })).toEqual({
      from: "2028-02-27",
      to: "2028-02-29",
    });
  });

  it("crosses a year", () => {
    expect(previousReportPeriod({ from: "2027-01-01", to: "2027-01-31" })).toEqual({
      from: "2026-12-01",
      to: "2026-12-31",
    });
  });

  it("has the length of the range and touches it, whatever the range", () => {
    fc.assert(
      fc.property(calendarDays, fc.integer({ min: 0, max: 400 }), (from, length) => {
        const to = new Date(Date.parse(`${from}T00:00:00Z`) + length * 86_400_000)
          .toISOString()
          .slice(0, 10);
        const previous = previousReportPeriod({ from, to });

        expect(dayCount(previous)).toBe(dayCount({ from, to }));
        expect(dayCount({ from: previous.to, to: from })).toBe(2);
      }),
    );
  });
});

describe("ticketChangeTenths", () => {
  it("is the rise over the previous average in tenths of a percent", () => {
    expect(ticketChangeTenths({ current: 1_057, previous: 1_000 })).toBe(57);
  });

  it("is negative for a fall", () => {
    expect(ticketChangeTenths({ current: 900, previous: 1_000 })).toBe(-100);
  });

  it("is zero when the average did not change", () => {
    expect(ticketChangeTenths({ current: 1_000, previous: 1_000 })).toBe(0);
  });

  it("can be more than doubling", () => {
    expect(ticketChangeTenths({ current: 5_000, previous: 1_000 })).toBe(4_000);
  });

  it("is a fall of everything when the current average is zero", () => {
    expect(ticketChangeTenths({ current: 0, previous: 1_000 })).toBe(-1_000);
  });

  it("rounds a rise of half a tenth up", () => {
    expect(ticketChangeTenths({ current: 2_001, previous: 2_000 })).toBe(1);
  });

  it("rounds a fall of half a tenth up, towards zero", () => {
    expect(ticketChangeTenths({ current: 1_999, previous: 2_000 })).toBe(0);
  });

  it("rounds a fall of one and a half tenths up", () => {
    expect(ticketChangeTenths({ current: 1_997, previous: 2_000 })).toBe(-1);
  });

  it("rounds to the nearest tenth", () => {
    expect(ticketChangeTenths({ current: 1_001, previous: 3_000 })).toBe(-666);
    expect(ticketChangeTenths({ current: 4_001, previous: 3_000 })).toBe(334);
  });

  it("is unknown without a current average", () => {
    expect(ticketChangeTenths({ current: null, previous: 1_000 })).toBeNull();
  });

  it("is unknown without a previous average", () => {
    expect(ticketChangeTenths({ current: 1_000, previous: null })).toBeNull();
  });

  it("is unknown when the previous average is zero", () => {
    expect(ticketChangeTenths({ current: 1_000, previous: 0 })).toBeNull();
  });

  it("stays within half a tenth of the exact change, whatever the averages", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000_000 }),
        fc.integer({ min: 1, max: 1_000_000_000 }),
        (current, previous) => {
          const change = ticketChangeTenths({ current, previous });

          expect(change).not.toBeNull();
          const exact = ((current - previous) * 1_000) / previous;
          expect(Math.abs((change ?? 0) - exact)).toBeLessThanOrEqual(0.5 + 1e-6);
        },
      ),
    );
  });
});

describe("salesOfWeeks", () => {
  const day = (date: string, salesCount: number, total: number) => ({
    day: date,
    salesCount,
    total,
  });

  it("is a single week for a single day", () => {
    expect(
      salesOfWeeks({ from: "2026-10-06", to: "2026-10-06" }, [day("2026-10-06", 2, 5_000)]),
    ).toEqual([
      { from: "2026-10-06", to: "2026-10-06", salesCount: 2, total: 5_000, averageTicket: 2_500 },
    ]);
  });

  it("is a single week for seven days", () => {
    expect(
      salesOfWeeks({ from: "2026-10-01", to: "2026-10-07" }, [
        day("2026-10-01", 1, 1_000),
        day("2026-10-07", 2, 3_000),
      ]),
    ).toEqual([
      { from: "2026-10-01", to: "2026-10-07", salesCount: 3, total: 4_000, averageTicket: 1_333 },
    ]);
  });

  it("cuts blocks of seven days counted back from the last day, newest first", () => {
    const weeks = salesOfWeeks({ from: "2026-10-01", to: "2026-10-17" }, [
      day("2026-10-01", 1, 100),
      day("2026-10-03", 1, 200),
      day("2026-10-04", 1, 300),
      day("2026-10-10", 2, 400),
      day("2026-10-11", 1, 500),
      day("2026-10-17", 4, 600),
    ]);

    expect(weeks).toEqual([
      { from: "2026-10-11", to: "2026-10-17", salesCount: 5, total: 1_100, averageTicket: 220 },
      { from: "2026-10-04", to: "2026-10-10", salesCount: 3, total: 700, averageTicket: 233 },
      { from: "2026-10-01", to: "2026-10-03", salesCount: 2, total: 300, averageTicket: 150 },
    ]);
  });

  it("keeps a week without sales, with zeros and no average", () => {
    expect(
      salesOfWeeks({ from: "2026-10-01", to: "2026-10-14" }, [day("2026-10-14", 1, 900)]),
    ).toEqual([
      { from: "2026-10-08", to: "2026-10-14", salesCount: 1, total: 900, averageTicket: 900 },
      { from: "2026-10-01", to: "2026-10-07", salesCount: 0, total: 0, averageTicket: null },
    ]);
  });

  it("is all empty weeks for a range without sales", () => {
    expect(salesOfWeeks({ from: "2026-10-01", to: "2026-10-08" }, [])).toEqual([
      { from: "2026-10-02", to: "2026-10-08", salesCount: 0, total: 0, averageTicket: null },
      { from: "2026-10-01", to: "2026-10-01", salesCount: 0, total: 0, averageTicket: null },
    ]);
  });

  it("covers the range without gaps and keeps every sale, whatever the range", () => {
    fc.assert(
      fc.property(
        calendarDays,
        fc.integer({ min: 0, max: 100 }),
        fc.array(
          fc.record({
            offset: fc.integer({ min: 0, max: 100 }),
            salesCount: fc.integer({ min: 1, max: 50 }),
            total: fc.integer({ min: 0, max: 1_000_000 }),
          }),
          { maxLength: 8 },
        ),
        (from, length, sold) => {
          const at = (offset: number) =>
            new Date(Date.parse(`${from}T00:00:00Z`) + offset * 86_400_000)
              .toISOString()
              .slice(0, 10);
          const range = { from, to: at(length) };
          const days = [
            ...new Map(sold.filter((s) => s.offset <= length).map((s) => [s.offset, s])).values(),
          ].map((s) => day(at(s.offset), s.salesCount, s.total));

          const weeks = salesOfWeeks(range, days);

          expect(weeks[0]?.to).toBe(range.to);
          expect(weeks.at(-1)?.from).toBe(range.from);
          weeks.forEach((week, index) => {
            const older = weeks[index + 1];
            expect(dayCount(week)).toBeLessThanOrEqual(7);
            if (older !== undefined) {
              expect(dayCount(week)).toBe(7);
              expect(dayCount({ from: older.to, to: week.from })).toBe(2);
            }
          });
          expect(weeks.reduce((sum, week) => sum + week.salesCount, 0)).toBe(
            days.reduce((sum, d) => sum + d.salesCount, 0),
          );
          expect(weeks.reduce((sum, week) => sum + week.total, 0)).toBe(
            days.reduce((sum, d) => sum + d.total, 0),
          );
        },
      ),
    );
  });
});
