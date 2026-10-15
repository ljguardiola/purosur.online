import { describe, expect, it } from "vitest";
import type { HandConfirmedPayment } from "../model/hand-confirmed-payments-reconciliation.js";
import { readHandConfirmedPayments } from "./read-hand-confirmed-payments.js";
import { FakeHandConfirmedPaymentsReader } from "./test-support/fake-hand-confirmed-payments-reader.js";

const NOW = new Date("2026-10-06T15:00:00.000Z");
const clock = { now: () => NOW };
const noRange = { from: undefined, to: undefined };

function aPayment(overrides: Partial<HandConfirmedPayment> = {}): HandConfirmedPayment {
  return {
    id: "payment-1",
    method: "TRANSFER",
    amount: 1_000,
    confirmedAt: new Date("2026-10-06T14:00:00.000Z"),
    cashierId: "cashier-1",
    cashierName: "Ana",
    confirmedById: "supervisor-1",
    confirmedByName: "Beto",
    saleOperationNumber: 7,
    ...overrides,
  };
}

describe("readHandConfirmedPayments", () => {
  it("reads the payments of the asked range for the branch and reconciles them", async () => {
    const payments = [
      aPayment({ id: "a", amount: 1_000 }),
      aPayment({ id: "b", method: "STANDALONE_TERMINAL", amount: 400 }),
    ];
    const reader = new FakeHandConfirmedPaymentsReader(payments);

    const report = await readHandConfirmedPayments(
      { reader, clock },
      {
        locationId: "branch-1",
        asked: { from: "2026-10-01", to: "2026-10-06" },
        registerId: undefined,
        method: undefined,
      },
    );

    expect(report.range).toEqual({ from: "2026-10-01", to: "2026-10-06" });
    expect(report.totals).toEqual({ count: 2, amount: 1_400 });
    expect(report.methods).toEqual([
      { method: "TRANSFER", count: 1, amount: 1_000 },
      { method: "STANDALONE_TERMINAL", count: 1, amount: 400 },
    ]);
    expect(report.cashiers.map(({ cashierId }) => cashierId)).toEqual(["cashier-1"]);
    expect(report.payments.map(({ id }) => id)).toEqual(["a", "b"]);
    expect(reader.reads).toEqual([
      {
        locationId: "branch-1",
        period: { from: "2026-10-01", to: "2026-10-06" },
        registerId: undefined,
        method: undefined,
      },
    ]);
  });

  it("asks for the current day in Argentina when no range is asked", async () => {
    const reader = new FakeHandConfirmedPaymentsReader();

    const report = await readHandConfirmedPayments(
      { reader, clock: { now: () => new Date("2026-10-07T01:30:00.000Z") } },
      { locationId: "branch-1", asked: noRange, registerId: undefined, method: undefined },
    );

    expect(report.range).toEqual({ from: "2026-10-06", to: "2026-10-06" });
    expect(reader.reads[0]?.period).toEqual({ from: "2026-10-06", to: "2026-10-06" });
  });

  it("limits the read to the asked register and method", async () => {
    const reader = new FakeHandConfirmedPaymentsReader();

    await readHandConfirmedPayments(
      { reader, clock },
      { locationId: "branch-1", asked: noRange, registerId: "register-2", method: "TRANSFER" },
    );

    expect(reader.reads[0]).toMatchObject({ registerId: "register-2", method: "TRANSFER" });
  });

  it("reports zero totals and both methods for a range without payments", async () => {
    const report = await readHandConfirmedPayments(
      { reader: new FakeHandConfirmedPaymentsReader(), clock },
      { locationId: "branch-1", asked: noRange, registerId: undefined, method: undefined },
    );

    expect(report.totals).toEqual({ count: 0, amount: 0 });
    expect(report.methods).toHaveLength(2);
    expect(report.cashiers).toEqual([]);
    expect(report.payments).toEqual([]);
  });
});
