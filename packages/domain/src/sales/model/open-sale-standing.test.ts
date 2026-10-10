import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { openSaleStanding, saleCancelRefusal, saleLinesLock } from "./open-sale-standing.js";

const CASH_PAYMENT = {
  id: "payment-1",
  method: "CASH",
  provider: "NONE",
  amount: 2000,
  state: "APPROVED",
} as const;

const QR_PAYMENT = {
  ...CASH_PAYMENT,
  id: "payment-3",
  method: "QR",
  provider: "MERCADOPAGO_QR",
} as const;

const NOW = new Date("2026-10-09T12:01:00.000Z");
const QR_CHARGE_IN_ITS_WAIT = { waitEndsAt: new Date("2026-10-09T12:03:00.000Z") };
const QR_CHARGE_PAST_ITS_WAIT = { waitEndsAt: new Date("2026-10-09T12:00:30.000Z") };

describe("openSaleStanding", () => {
  it("leaves the lines editable and the sale cancellable while nothing is paid", () => {
    expect(openSaleStanding(5900, [], [], NOW)).toEqual({
      balance: { paid: 0, pending: 5900 },
      linesLock: null,
      cancellable: true,
      cancelRefusal: null,
      refundsOnCancel: [],
    });
  });

  it("locks the lines by the approved payment and leaves cancelling to the paid cancellation, showing what it refunds", () => {
    expect(openSaleStanding(5900, [CASH_PAYMENT], [], NOW)).toEqual({
      balance: { paid: 2000, pending: 3900 },
      linesLock: "approved_payment",
      cancellable: false,
      cancelRefusal: null,
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
      linesLock: null,
      cancellable: true,
      cancelRefusal: null,
      refundsOnCancel: [],
    });
  });

  it("locks the lines and refuses the cancellation by the QR charge in its wait while nothing is paid", () => {
    expect(openSaleStanding(5900, [], [QR_CHARGE_IN_ITS_WAIT], NOW)).toMatchObject({
      linesLock: "qr_charge_in_progress",
      cancellable: false,
      cancelRefusal: "qr_charge_in_progress",
      refundsOnCancel: [],
    });
  });

  it("keeps the lines locked by the approved payment and refuses the cancellation by the QR charge in its wait", () => {
    expect(openSaleStanding(5900, [CASH_PAYMENT], [QR_CHARGE_IN_ITS_WAIT], NOW)).toMatchObject({
      linesLock: "approved_payment",
      cancellable: false,
      cancelRefusal: "qr_charge_in_progress",
      refundsOnCancel: [],
    });
  });

  it("frees the lines and the cancellation once the QR charge's wait is over", () => {
    expect(openSaleStanding(5900, [], [QR_CHARGE_PAST_ITS_WAIT], NOW)).toMatchObject({
      linesLock: null,
      cancellable: true,
      cancelRefusal: null,
      refundsOnCancel: [],
    });
  });

  it("refuses the cancellation of a sale holding an approved QR payment, planning no refund", () => {
    expect(openSaleStanding(5900, [CASH_PAYMENT, QR_PAYMENT], [], NOW)).toEqual({
      balance: { paid: 4000, pending: 1900 },
      linesLock: "approved_payment",
      cancellable: false,
      cancelRefusal: "holds_qr_payment",
      refundsOnCancel: [],
    });
  });

  it("answers exactly one way to cancel: without authorization, refused, or refunding the payments", () => {
    const payment = fc.record({
      id: fc.string(),
      method: fc.constantFrom("CASH", "TRANSFER", "QR"),
      provider: fc.constantFrom("NONE", "MERCADOPAGO_QR"),
      amount: fc.integer({ min: 1, max: 100_000 }),
      state: fc.constantFrom("APPROVED", "REJECTED", "PENDING"),
    });
    const pendingQrPayment = fc.record({
      waitEndsAt: fc.constantFrom(
        QR_CHARGE_IN_ITS_WAIT.waitEndsAt,
        QR_CHARGE_PAST_ITS_WAIT.waitEndsAt,
      ),
    });

    fc.assert(
      fc.property(fc.array(payment), fc.array(pendingQrPayment), (payments, pending) => {
        const standing = openSaleStanding(5900, payments, pending, NOW);
        const ways = [
          standing.cancellable,
          standing.cancelRefusal !== null,
          standing.refundsOnCancel.length > 0,
        ];

        expect(ways.filter(Boolean)).toHaveLength(1);
        expect(standing.cancelRefusal).toBe(saleCancelRefusal(payments, pending, NOW));
        expect(standing.linesLock).toBe(saleLinesLock(payments, pending, NOW));
      }),
    );
  });
});

describe("saleLinesLock", () => {
  it.each([
    ["nothing is paid nor in its wait", [], [], null],
    ["a payment was rejected", [{ ...CASH_PAYMENT, state: "REJECTED" }], [], null],
    ["a QR charge's wait is over", [], [QR_CHARGE_PAST_ITS_WAIT], null],
    ["a payment is approved", [CASH_PAYMENT], [], "approved_payment"],
    ["a QR charge is in its wait", [], [QR_CHARGE_IN_ITS_WAIT], "qr_charge_in_progress"],
    [
      "a payment is approved and a QR charge is in its wait",
      [CASH_PAYMENT],
      [QR_CHARGE_IN_ITS_WAIT],
      "approved_payment",
    ],
  ] as const)("answers what locks the lines when %s", (_case, payments, pending, lock) => {
    expect(saleLinesLock(payments, pending, NOW)).toBe(lock);
  });
});

describe("saleCancelRefusal", () => {
  it.each([
    ["nothing is paid nor in its wait", [], [], null],
    ["a cash payment is approved", [CASH_PAYMENT], [], null],
    ["a QR payment was rejected", [{ ...QR_PAYMENT, state: "REJECTED" }], [], null],
    ["a QR charge's wait is over", [], [QR_CHARGE_PAST_ITS_WAIT], null],
    ["a QR charge is in its wait", [], [QR_CHARGE_IN_ITS_WAIT], "qr_charge_in_progress"],
    ["a QR payment is approved", [QR_PAYMENT], [], "holds_qr_payment"],
    [
      "a QR payment is approved and another QR charge is in its wait",
      [QR_PAYMENT],
      [QR_CHARGE_IN_ITS_WAIT],
      "qr_charge_in_progress",
    ],
  ] as const)("answers why cancelling is refused when %s", (_case, payments, pending, refusal) => {
    expect(saleCancelRefusal(payments, pending, NOW)).toBe(refusal);
  });
});
