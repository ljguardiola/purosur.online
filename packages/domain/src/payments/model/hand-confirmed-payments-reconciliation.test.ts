import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type HandConfirmedPayment,
  reconcileHandConfirmedPayments,
} from "./hand-confirmed-payments-reconciliation.js";
import { CONFIRMED_BY_HAND_METHODS } from "./payment.js";

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

const paymentArbitrary = fc.record({
  id: fc.uuid(),
  method: fc.constantFrom(...CONFIRMED_BY_HAND_METHODS),
  amount: fc.integer({ min: 1, max: 1_000_000 }),
  confirmedAt: fc.date({
    min: new Date("2026-01-01"),
    max: new Date("2026-12-31"),
    noInvalidDate: true,
  }),
  cashierId: fc.constantFrom("cashier-1", "cashier-2", "cashier-3"),
  cashierName: fc.constantFrom("Ana", "Bruno", null),
  confirmedById: fc.constantFrom("supervisor-1", "supervisor-2"),
  confirmedByName: fc.constantFrom("Carla", null),
  saleOperationNumber: fc.option(fc.integer({ min: 1, max: 9_999 }), { nil: null }),
});

describe("reconcileHandConfirmedPayments", () => {
  it("reports zero totals and every method with zeros when there are no payments", () => {
    expect(reconcileHandConfirmedPayments([])).toEqual({
      totals: { count: 0, amount: 0 },
      methods: [
        { method: "TRANSFER", count: 0, amount: 0 },
        { method: "STANDALONE_TERMINAL", count: 0, amount: 0 },
      ],
      cashiers: [],
      payments: [],
    });
  });

  it("adds up the payments of each method and keeps a method without payments at zero", () => {
    const report = reconcileHandConfirmedPayments([
      aPayment({ id: "a", method: "TRANSFER", amount: 1_000 }),
      aPayment({ id: "b", method: "TRANSFER", amount: 500 }),
    ]);

    expect(report.totals).toEqual({ count: 2, amount: 1_500 });
    expect(report.methods).toEqual([
      { method: "TRANSFER", count: 2, amount: 1_500 },
      { method: "STANDALONE_TERMINAL", count: 0, amount: 0 },
    ]);
  });

  it("splits each cashier's payments by method, always listing both methods", () => {
    const report = reconcileHandConfirmedPayments([
      aPayment({ id: "a", method: "STANDALONE_TERMINAL", amount: 2_000 }),
      aPayment({ id: "b", method: "TRANSFER", amount: 300 }),
      aPayment({ id: "c", method: "STANDALONE_TERMINAL", amount: 100 }),
    ]);

    expect(report.cashiers).toEqual([
      {
        cashierId: "cashier-1",
        cashierName: "Ana",
        count: 3,
        amount: 2_400,
        methods: [
          { method: "TRANSFER", count: 1, amount: 300 },
          { method: "STANDALONE_TERMINAL", count: 2, amount: 2_100 },
        ],
      },
    ]);
  });

  it("lists the cashier with the larger amount first, and by name on equal amounts", () => {
    const report = reconcileHandConfirmedPayments([
      aPayment({ id: "a", cashierId: "c-1", cashierName: "Zoe", amount: 500 }),
      aPayment({ id: "b", cashierId: "c-2", cashierName: "Ana", amount: 500 }),
      aPayment({ id: "c", cashierId: "c-3", cashierName: "Mia", amount: 900 }),
    ]);

    expect(report.cashiers.map(({ cashierName }) => cashierName)).toEqual(["Mia", "Ana", "Zoe"]);
  });

  it("orders cashiers with the same amount by name in Spanish, an unknown name last", () => {
    const report = reconcileHandConfirmedPayments([
      aPayment({ id: "a", cashierId: "c-1", cashierName: null, amount: 500 }),
      aPayment({ id: "b", cashierId: "c-2", cashierName: "Óscar", amount: 500 }),
      aPayment({ id: "c", cashierId: "c-3", cashierName: "Pedro", amount: 500 }),
      aPayment({ id: "d", cashierId: "c-4", cashierName: "Ñandú", amount: 500 }),
    ]);

    expect(report.cashiers.map(({ cashierName }) => cashierName)).toEqual([
      "Ñandú",
      "Óscar",
      "Pedro",
      null,
    ]);
  });

  it.each([
    ["before", [null, "Ana"], "Ana"],
    ["after", ["Ana", null], "Ana"],
    ["before", [null, "Zoe"], "Zoe"],
    ["after", ["Zoe", null], "Zoe"],
  ])(
    "puts a cashier with an unknown name last when it comes %s a named one",
    (_position, names, named) => {
      const report = reconcileHandConfirmedPayments(
        names.map((cashierName, index) =>
          aPayment({ id: `p-${index}`, cashierId: `c-${index}`, cashierName, amount: 500 }),
        ),
      );

      expect(report.cashiers.map(({ cashierName }) => cashierName)).toEqual([named, null]);
    },
  );

  it("orders cashiers with the same amount and name by their id", () => {
    const report = reconcileHandConfirmedPayments([
      aPayment({ id: "a", cashierId: "c-2", cashierName: "Ana", amount: 500 }),
      aPayment({ id: "b", cashierId: "c-1", cashierName: "Ana", amount: 500 }),
      aPayment({ id: "c", cashierId: "c-4", cashierName: null, amount: 500 }),
      aPayment({ id: "d", cashierId: "c-3", cashierName: null, amount: 500 }),
    ]);

    expect(report.cashiers.map(({ cashierId }) => cashierId)).toEqual(["c-1", "c-2", "c-3", "c-4"]);
  });

  it("keeps an unknown name last even when its id sorts first", () => {
    const report = reconcileHandConfirmedPayments([
      aPayment({ id: "a", cashierId: "z", cashierName: "Ana", amount: 500 }),
      aPayment({ id: "b", cashierId: "a", cashierName: null, amount: 500 }),
    ]);

    expect(report.cashiers.map(({ cashierId }) => cashierId)).toEqual(["z", "a"]);
  });

  it("keeps a cashier with an unknown name and groups by the cashier's id", () => {
    const report = reconcileHandConfirmedPayments([
      aPayment({ id: "a", cashierId: "gone", cashierName: null, amount: 700 }),
      aPayment({ id: "b", cashierId: "gone", cashierName: null, amount: 300 }),
    ]);

    expect(report.cashiers).toHaveLength(1);
    expect(report.cashiers[0]).toMatchObject({
      cashierId: "gone",
      cashierName: null,
      count: 2,
      amount: 1_000,
    });
  });

  it("lists the payments newest confirmation first", () => {
    const report = reconcileHandConfirmedPayments([
      aPayment({ id: "old", confirmedAt: new Date("2026-10-05T10:00:00.000Z") }),
      aPayment({ id: "new", confirmedAt: new Date("2026-10-06T10:00:00.000Z") }),
      aPayment({ id: "mid", confirmedAt: new Date("2026-10-05T18:00:00.000Z") }),
    ]);

    expect(report.payments.map(({ id }) => id)).toEqual(["new", "mid", "old"]);
  });

  it("does not reorder or alter the payments it receives", () => {
    const received = [
      aPayment({ id: "old", confirmedAt: new Date("2026-10-05T10:00:00.000Z") }),
      aPayment({ id: "new", confirmedAt: new Date("2026-10-06T10:00:00.000Z") }),
    ];

    reconcileHandConfirmedPayments(received);

    expect(received.map(({ id }) => id)).toEqual(["old", "new"]);
  });

  it("adds the same total by payments, by method and by cashier, whatever the payments", () => {
    fc.assert(
      fc.property(fc.array(paymentArbitrary, { maxLength: 30 }), (payments) => {
        const report = reconcileHandConfirmedPayments(payments);
        const amount = payments.reduce((sum, payment) => sum + payment.amount, 0);

        expect(report.totals).toEqual({ count: payments.length, amount });
        expect(report.methods.reduce((sum, method) => sum + method.amount, 0)).toBe(amount);
        expect(report.methods.reduce((sum, method) => sum + method.count, 0)).toBe(payments.length);
        expect(report.cashiers.reduce((sum, cashier) => sum + cashier.amount, 0)).toBe(amount);
        expect(report.cashiers.reduce((sum, cashier) => sum + cashier.count, 0)).toBe(
          payments.length,
        );
        for (const cashier of report.cashiers) {
          expect(cashier.methods.map(({ method }) => method)).toEqual([
            ...CONFIRMED_BY_HAND_METHODS,
          ]);
          expect(cashier.methods.reduce((sum, method) => sum + method.amount, 0)).toBe(
            cashier.amount,
          );
          expect(cashier.methods.reduce((sum, method) => sum + method.count, 0)).toBe(
            cashier.count,
          );
        }
        expect(report.payments).toHaveLength(payments.length);
      }),
    );
  });
});
