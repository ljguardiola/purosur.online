import { describe, expect, it } from "vitest";
import { openSaleStanding } from "./open-sale-standing.js";

const CASH_PAYMENT = {
  id: "payment-1",
  method: "CASH",
  provider: "NONE",
  amount: 2000,
  state: "APPROVED",
} as const;

describe("openSaleStanding", () => {
  it("leaves the lines editable and the sale cancellable while nothing is paid", () => {
    expect(openSaleStanding(5900, [])).toEqual({
      balance: { paid: 0, pending: 5900 },
      linesEditable: true,
      cancellable: true,
      refundsOnCancel: [],
    });
  });

  it("freezes the lines and the cancellation once a payment is approved, showing what cancelling refunds", () => {
    expect(openSaleStanding(5900, [CASH_PAYMENT])).toEqual({
      balance: { paid: 2000, pending: 3900 },
      linesEditable: false,
      cancellable: false,
      refundsOnCancel: [
        {
          paymentId: "payment-1",
          method: "CASH",
          provider: "NONE",
          amount: 2000,
          state: "APPROVED",
        },
      ],
    });
  });

  it("shows a pending refund for an approved transfer", () => {
    const transfer = { ...CASH_PAYMENT, id: "payment-2", method: "TRANSFER" } as const;

    expect(openSaleStanding(5900, [transfer]).refundsOnCancel).toEqual([
      {
        paymentId: "payment-2",
        method: "TRANSFER",
        provider: "NONE",
        amount: 2000,
        state: "PENDING",
      },
    ]);
  });

  it("keeps the lines editable and the sale cancellable when no payment is approved", () => {
    expect(openSaleStanding(5900, [{ ...CASH_PAYMENT, state: "REJECTED" }])).toEqual({
      balance: { paid: 0, pending: 5900 },
      linesEditable: true,
      cancellable: true,
      refundsOnCancel: [],
    });
  });
});
