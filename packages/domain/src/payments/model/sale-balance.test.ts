import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { approvedPaymentsCoverTotal, saleBalance } from "./sale-balance.js";

describe("saleBalance", () => {
  it("leaves the whole total pending when nothing was paid", () => {
    expect(saleBalance(5900, [])).toEqual({ paid: 0, pending: 5900 });
  });

  it("adds up the approved payments and leaves the rest pending", () => {
    expect(
      saleBalance(5900, [
        { amount: 2000, state: "APPROVED" },
        { amount: 1500, state: "APPROVED" },
      ]),
    ).toEqual({ paid: 3500, pending: 2400 });
  });

  it("leaves nothing pending when the approved payments cover the total", () => {
    expect(saleBalance(5900, [{ amount: 5900, state: "APPROVED" }])).toEqual({
      paid: 5900,
      pending: 0,
    });
  });

  it("ignores a payment that is not approved", () => {
    expect(
      saleBalance(5900, [
        { amount: 2000, state: "APPROVED" },
        { amount: 3000, state: "REJECTED" },
      ]),
    ).toEqual({ paid: 2000, pending: 3900 });
  });

  it("splits the total into what was paid and what is pending for every set of payments", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 10_000 }), { maxLength: 8 }),
        fc.integer({ min: 0, max: 10_000 }),
        (amounts, remaining) => {
          const paid = amounts.reduce((sum, amount) => sum + amount, 0);
          const balance = saleBalance(
            paid + remaining,
            amounts.map((amount) => ({ amount, state: "APPROVED" })),
          );
          expect(balance).toEqual({ paid, pending: remaining });
        },
      ),
    );
  });
});

function payment(amount: number, state: string): { amount: number; state: string } {
  return { amount, state };
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
