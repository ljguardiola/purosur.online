import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { approvedPaymentsCoverTotal, type CompletedSalePayment } from "./completed-sale.js";

function payment(amount: number, state: string): CompletedSalePayment {
  return {
    id: `payment-${amount}-${state}`,
    method: "CASH",
    provider: "NONE",
    amount,
    tendered: null,
    state,
    occurredAt: new Date("2026-10-07T10:00:00.000Z"),
    authorizedBy: null,
    confirmedAt: null,
  };
}

describe("whether a completed sale's approved payments cover its total", () => {
  it("covers it when one approved payment equals the total", () => {
    expect(approvedPaymentsCoverTotal({ total: 1500, payments: [payment(1500, "APPROVED")] })).toBe(
      true,
    );
  });

  it("covers it when approved payments add up to more than the total", () => {
    expect(
      approvedPaymentsCoverTotal({
        total: 1500,
        payments: [payment(1000, "APPROVED"), payment(1000, "APPROVED")],
      }),
    ).toBe(true);
  });

  it("does not cover it when approved payments add up to less than the total", () => {
    expect(
      approvedPaymentsCoverTotal({
        total: 1500,
        payments: [payment(1000, "APPROVED"), payment(499, "APPROVED")],
      }),
    ).toBe(false);
  });

  it("does not count a payment that is not approved", () => {
    expect(
      approvedPaymentsCoverTotal({
        total: 1500,
        payments: [payment(1000, "APPROVED"), payment(1000, "DECLINED")],
      }),
    ).toBe(false);
  });

  it("does not cover a sale with a total and no payment at all", () => {
    expect(approvedPaymentsCoverTotal({ total: 1, payments: [] })).toBe(false);
  });

  it("covers a sale of nothing with no payment at all", () => {
    expect(approvedPaymentsCoverTotal({ total: 0, payments: [] })).toBe(true);
  });

  it("holds exactly when the approved amounts add up to at least the total, whatever else was paid", () => {
    const amounts = fc.array(
      fc.record({
        amount: fc.integer({ min: 0, max: 100_000 }),
        state: fc.constantFrom("APPROVED", "DECLINED", "PENDING"),
      }),
      { maxLength: 6 },
    );
    fc.assert(
      fc.property(amounts, fc.integer({ min: 0, max: 300_000 }), (paid, total) => {
        const approved = paid
          .filter((one) => one.state === "APPROVED")
          .reduce((sum, one) => sum + one.amount, 0);

        expect(
          approvedPaymentsCoverTotal({
            total,
            payments: paid.map((one) => payment(one.amount, one.state)),
          }),
        ).toBe(approved >= total);
      }),
    );
  });
});
