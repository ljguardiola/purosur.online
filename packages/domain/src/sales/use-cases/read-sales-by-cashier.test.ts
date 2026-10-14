import { describe, expect, it } from "vitest";
import { readSalesByCashier } from "./read-sales-by-cashier.js";
import { FakeCashierSalesReportReader } from "./test-support/fake-cashier-sales-report-reader.js";

const NOW = new Date("2026-10-06T15:00:00.000Z");
const clock = { now: () => NOW };
const noRange = { from: undefined, to: undefined };

const sold = [
  { cashierId: "u1", name: "Ana", sessions: 1, salesCount: 1, total: 2_000 },
  { cashierId: "u2", name: null, sessions: 2, salesCount: 3, total: 9_000 },
];

describe("readSalesByCashier", () => {
  it("orders the cashiers who sold in the asked range and totals them", async () => {
    const reader = new FakeCashierSalesReportReader(sold);

    const report = await readSalesByCashier(
      { reader, clock },
      {
        locationId: "branch-1",
        asked: { from: "2026-10-01", to: "2026-10-06" },
        registerId: undefined,
      },
    );

    expect(report).toEqual({
      range: { from: "2026-10-01", to: "2026-10-06" },
      rows: [
        {
          cashierId: "u2",
          name: null,
          sessions: 2,
          salesCount: 3,
          total: 9_000,
          averageTicket: 3_000,
        },
        {
          cashierId: "u1",
          name: "Ana",
          sessions: 1,
          salesCount: 1,
          total: 2_000,
          averageTicket: 2_000,
        },
      ],
      totals: { cashiers: 2, salesCount: 4, total: 11_000, averageTicket: 2_750 },
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
    const reader = new FakeCashierSalesReportReader();

    const report = await readSalesByCashier(
      { reader, clock },
      { locationId: "branch-1", asked: noRange, registerId: undefined },
    );

    expect(report.range).toEqual({ from: "2026-10-06", to: "2026-10-06" });
    expect(reader.reads[0]?.range).toEqual({ from: "2026-10-06", to: "2026-10-06" });
  });

  it("limits the read to the asked register", async () => {
    const reader = new FakeCashierSalesReportReader();

    await readSalesByCashier(
      { reader, clock },
      { locationId: "branch-1", asked: noRange, registerId: "register-2" },
    );

    expect(reader.reads[0]?.registerId).toBe("register-2");
  });

  it("reports no rows and zero totals for a range without sales", async () => {
    const report = await readSalesByCashier(
      { reader: new FakeCashierSalesReportReader(), clock },
      { locationId: "branch-1", asked: noRange, registerId: undefined },
    );

    expect(report.rows).toEqual([]);
    expect(report.totals).toEqual({ cashiers: 0, salesCount: 0, total: 0, averageTicket: null });
  });
});
