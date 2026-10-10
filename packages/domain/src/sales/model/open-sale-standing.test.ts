import { describe, expect, it } from "vitest";
import { openSaleStanding } from "./open-sale-standing.js";

const CASH_PAYMENT = {
  id: "payment-1",
  method: "CASH",
  provider: "NONE",
  amount: 2000,
  state: "APPROVED",
} as const;

const NOW = new Date("2026-10-09T12:01:00.000Z");
const QR_CHARGE_IN_ITS_WAIT = { waitEndsAt: new Date("2026-10-09T12:03:00.000Z") };
const QR_CHARGE_PAST_ITS_WAIT = { waitEndsAt: new Date("2026-10-09T12:00:30.000Z") };

describe("openSaleStanding", () => {
  it("leaves the lines editable and the sale cancellable while nothing is paid", () => {
    expect(openSaleStanding(5900, [], [], NOW)).toEqual({
      balance: { paid: 0, pending: 5900 },
      linesEditable: true,
      cancellable: true,
      refundsOnCancel: [],
    });
  });

  it("freezes the lines and the cancellation once a payment is approved, showing what cancelling refunds", () => {
    expect(openSaleStanding(5900, [CASH_PAYMENT], [], NOW)).toEqual({
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

    expect(openSaleStanding(5900, [transfer], [], NOW).refundsOnCancel).toEqual([
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
    expect(openSaleStanding(5900, [{ ...CASH_PAYMENT, state: "REJECTED" }], [], NOW)).toEqual({
      balance: { paid: 0, pending: 5900 },
      linesEditable: true,
      cancellable: true,
      refundsOnCancel: [],
    });
  });

  it.each([
    ["nothing is paid", []],
    ["a cash payment is approved", [CASH_PAYMENT]],
  ] as const)(
    "freezes the lines and the cancellation, planning no refund, while a QR charge is in its wait and %s",
    (_paid, payments) => {
      expect(openSaleStanding(5900, payments, [QR_CHARGE_IN_ITS_WAIT], NOW)).toMatchObject({
        linesEditable: false,
        cancellable: false,
        refundsOnCancel: [],
      });
    },
  );

  it("frees the lines and the cancellation once the QR charge's wait is over", () => {
    expect(openSaleStanding(5900, [], [QR_CHARGE_PAST_ITS_WAIT], NOW)).toMatchObject({
      linesEditable: true,
      cancellable: true,
      refundsOnCancel: [],
    });
  });

  it("plans no refund for a sale holding an approved QR payment, since cancelling it is refused", () => {
    const qr = {
      ...CASH_PAYMENT,
      id: "payment-3",
      method: "QR",
      provider: "MERCADOPAGO_QR",
    } as const;

    expect(openSaleStanding(5900, [CASH_PAYMENT, qr], [], NOW)).toEqual({
      balance: { paid: 4000, pending: 1900 },
      linesEditable: false,
      cancellable: false,
      refundsOnCancel: [],
    });
  });
});
