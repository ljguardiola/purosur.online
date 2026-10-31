import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  paidOrderAwaitsApplication,
  paidOrderWithoutSaleIsResolved,
  rebuiltPaidOrderAppliedAmount,
  rebuiltPaidOrderStanding,
  rebuiltPaidOrderSurplus,
} from "./rebuilt-paid-order.js";

const amount = fc.integer({ min: 1, max: 10_000_000 });

describe("rebuiltPaidOrderAppliedAmount", () => {
  it("applies the whole paid amount when the sale's total is higher", () => {
    expect(rebuiltPaidOrderAppliedAmount(2000, 5000)).toBe(2000);
  });

  it("applies the whole paid amount when the sale's total equals it", () => {
    expect(rebuiltPaidOrderAppliedAmount(2000, 2000)).toBe(2000);
  });

  it("applies only the sale's total when the paid amount is higher", () => {
    expect(rebuiltPaidOrderAppliedAmount(5000, 2000)).toBe(2000);
  });

  it("never applies more than either amount, for every pair", () => {
    fc.assert(
      fc.property(amount, amount, (paid, total) => {
        const applied = rebuiltPaidOrderAppliedAmount(paid, total);
        expect(applied).toBeLessThanOrEqual(paid);
        expect(applied).toBeLessThanOrEqual(total);
        expect(applied === paid || applied === total).toBe(true);
      }),
    );
  });
});

describe("rebuiltPaidOrderSurplus", () => {
  it("is what the paid amount exceeds the sale's total by", () => {
    expect(rebuiltPaidOrderSurplus(5000, 2000)).toBe(3000);
  });

  it("is nothing when the total equals the paid amount", () => {
    expect(rebuiltPaidOrderSurplus(2000, 2000)).toBe(0);
  });

  it("is nothing when the total is higher than the paid amount", () => {
    expect(rebuiltPaidOrderSurplus(2000, 5000)).toBe(0);
  });

  it("adds up with the applied amount to the paid amount, for every pair", () => {
    fc.assert(
      fc.property(amount, amount, (paid, total) => {
        const surplus = rebuiltPaidOrderSurplus(paid, total);
        expect(surplus).toBeGreaterThanOrEqual(0);
        expect(rebuiltPaidOrderAppliedAmount(paid, total) + surplus).toBe(paid);
      }),
    );
  });
});

describe("paidOrderAwaitsApplication", () => {
  it("does not await anything for a sale that is not linked to a paid order", () => {
    expect(paidOrderAwaitsApplication(undefined, [{ id: "payment-1" }])).toBe(false);
  });

  it("awaits the order's application while no payment of the sale carries its id", () => {
    expect(paidOrderAwaitsApplication({ paymentTransactionId: "order-1" }, [])).toBe(true);
    expect(
      paidOrderAwaitsApplication({ paymentTransactionId: "order-1" }, [{ id: "payment-1" }]),
    ).toBe(true);
  });

  it("stops awaiting once a payment of the sale carries the order's id", () => {
    expect(
      paidOrderAwaitsApplication({ paymentTransactionId: "order-1" }, [
        { id: "payment-1" },
        { id: "order-1" },
      ]),
    ).toBe(false);
  });
});

describe("paidOrderWithoutSaleIsResolved", () => {
  it("is not resolved while nothing was done with the order", () => {
    expect(paidOrderWithoutSaleIsResolved({ convertedIntoRefund: false, rebuiltSales: [] })).toBe(
      false,
    );
  });

  it("is resolved once it was converted into a refund, whatever its rebuilt sales", () => {
    expect(paidOrderWithoutSaleIsResolved({ convertedIntoRefund: true, rebuiltSales: [] })).toBe(
      true,
    );
    expect(
      paidOrderWithoutSaleIsResolved({
        convertedIntoRefund: true,
        rebuiltSales: [{ state: "OPEN", paymentApplied: false }],
      }),
    ).toBe(true);
  });

  it("is resolved once a rebuilt sale is completed", () => {
    expect(
      paidOrderWithoutSaleIsResolved({
        convertedIntoRefund: false,
        rebuiltSales: [{ state: "COMPLETED", paymentApplied: true }],
      }),
    ).toBe(true);
  });

  it("is not resolved while a rebuilt sale is still open, applied or not", () => {
    for (const paymentApplied of [true, false]) {
      expect(
        paidOrderWithoutSaleIsResolved({
          convertedIntoRefund: false,
          rebuiltSales: [{ state: "OPEN", paymentApplied }],
        }),
      ).toBe(false);
    }
  });

  it("is not resolved by a rebuilt sale cancelled before the order was applied to it", () => {
    expect(
      paidOrderWithoutSaleIsResolved({
        convertedIntoRefund: false,
        rebuiltSales: [{ state: "CANCELLED", paymentApplied: false }],
      }),
    ).toBe(false);
  });

  it("is resolved by a rebuilt sale cancelled after the order was applied, which refunds that payment", () => {
    expect(
      paidOrderWithoutSaleIsResolved({
        convertedIntoRefund: false,
        rebuiltSales: [{ state: "CANCELLED", paymentApplied: true }],
      }),
    ).toBe(true);
  });

  it("is resolved when any one of several rebuilt sales resolves it, in any order", () => {
    const resolving = { state: "COMPLETED", paymentApplied: true } as const;
    const unresolving = { state: "CANCELLED", paymentApplied: false } as const;
    expect(
      paidOrderWithoutSaleIsResolved({
        convertedIntoRefund: false,
        rebuiltSales: [unresolving, resolving],
      }),
    ).toBe(true);
    expect(
      paidOrderWithoutSaleIsResolved({
        convertedIntoRefund: false,
        rebuiltSales: [resolving, unresolving],
      }),
    ).toBe(true);
  });
});

describe("rebuiltPaidOrderStanding", () => {
  const order = { paymentTransactionId: "order-1", amount: 4500, method: "QR" } as const;

  it("is nothing for a sale that was not rebuilt against a paid order", () => {
    expect(rebuiltPaidOrderStanding(undefined, [])).toBeNull();
  });

  it("names the order with its amount and method, waiting to be applied, while the sale holds no payment of it", () => {
    expect(rebuiltPaidOrderStanding(order, [{ id: "cash-1" }])).toEqual({ ...order, applied: false });
  });

  it("names the order as applied once the sale holds the payment of it", () => {
    expect(rebuiltPaidOrderStanding(order, [{ id: "cash-1" }, { id: "order-1" }])).toEqual({
      ...order,
      applied: true,
    });
  });
});
