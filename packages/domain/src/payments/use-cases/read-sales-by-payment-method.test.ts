import { describe, expect, it } from "vitest";
import { readSalesByPaymentMethod } from "./read-sales-by-payment-method.js";
import { FakePaymentsReportReader } from "./test-support/fake-payments-report-reader.js";

const NOW = new Date("2026-10-06T15:00:00.000Z");
const clock = { now: () => NOW };
const noRange = { from: undefined, to: undefined };

const PAID = {
  methods: [
    { method: "CASH" as const, salesCount: 2, amount: 9_000 },
    { method: "QR" as const, salesCount: 2, amount: 6_000 },
  ],
  salesCount: 3,
  total: 15_000,
};

describe("readSalesByPaymentMethod", () => {
  it("reads the approved payments of the asked range for the branch and totals them", async () => {
    const reader = new FakePaymentsReportReader(PAID);

    const report = await readSalesByPaymentMethod(
      { reader, clock },
      {
        locationId: "branch-1",
        asked: { from: "2026-10-01", to: "2026-10-06" },
        registerId: undefined,
      },
    );

    expect(report).toEqual({
      range: { from: "2026-10-01", to: "2026-10-06" },
      methods: PAID.methods,
      totals: { salesCount: 3, total: 15_000, averageTicket: 5_000 },
    });
    expect(reader.approvedPaymentsReads).toEqual([
      {
        locationId: "branch-1",
        period: { from: "2026-10-01", to: "2026-10-06" },
        registerId: undefined,
      },
    ]);
  });

  it("asks for the current day of the clock when no range is asked", async () => {
    const reader = new FakePaymentsReportReader();

    const report = await readSalesByPaymentMethod(
      { reader, clock },
      { locationId: "branch-1", asked: noRange, registerId: undefined },
    );

    expect(report.range).toEqual({ from: "2026-10-06", to: "2026-10-06" });
    expect(reader.approvedPaymentsReads[0]?.period).toEqual({
      from: "2026-10-06",
      to: "2026-10-06",
    });
  });

  it("resolves the current day in Argentina, not in UTC", async () => {
    const report = await readSalesByPaymentMethod(
      {
        reader: new FakePaymentsReportReader(),
        clock: { now: () => new Date("2026-10-07T01:30:00.000Z") },
      },
      { locationId: "branch-1", asked: noRange, registerId: undefined },
    );

    expect(report.range).toEqual({ from: "2026-10-06", to: "2026-10-06" });
  });

  it("limits the read to the asked register", async () => {
    const reader = new FakePaymentsReportReader();

    await readSalesByPaymentMethod(
      { reader, clock },
      { locationId: "branch-1", asked: noRange, registerId: "register-2" },
    );

    expect(reader.approvedPaymentsReads[0]?.registerId).toBe("register-2");
  });

  it("reports no methods, zero totals and no average ticket for a range without payments", async () => {
    const report = await readSalesByPaymentMethod(
      { reader: new FakePaymentsReportReader(), clock },
      { locationId: "branch-1", asked: noRange, registerId: undefined },
    );

    expect(report.methods).toEqual([]);
    expect(report.totals).toEqual({ salesCount: 0, total: 0, averageTicket: null });
  });
});
