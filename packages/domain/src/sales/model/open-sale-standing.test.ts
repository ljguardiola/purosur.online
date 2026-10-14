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

const POINT_PAYMENT = {
  ...QR_PAYMENT,
  id: "payment-4",
  method: "POINT",
  provider: "MERCADOPAGO_POINT",
} as const;

const STANDALONE_TERMINAL_PAYMENT = {
  ...CASH_PAYMENT,
  id: "payment-5",
  method: "STANDALONE_TERMINAL",
  provider: "EXTERNAL_TERMINAL",
} as const;

const NOW = new Date("2026-10-09T12:01:00.000Z");
const QR_CHARGE_IN_ITS_WAIT = {
  id: "qr-1",
  method: "QR",
  amount: 3000,
  occurredAt: new Date("2026-10-09T12:00:00.000Z"),
  waitEndsAt: new Date("2026-10-09T12:03:00.000Z"),
} as const;
const QR_CHARGE_PAST_ITS_WAIT = {
  id: "qr-0",
  method: "QR",
  amount: 3000,
  occurredAt: new Date("2026-10-09T11:57:30.000Z"),
  waitEndsAt: new Date("2026-10-09T12:00:30.000Z"),
} as const;
const POINT_CHARGE_PAST_ITS_WAIT = {
  id: "point-1",
  method: "POINT",
  amount: 4000,
  occurredAt: new Date("2026-10-09T11:57:30.000Z"),
  waitEndsAt: new Date("2026-10-09T12:00:30.000Z"),
} as const;

describe("openSaleStanding", () => {
  it("leaves the lines editable and the sale cancellable while nothing is paid", () => {
    expect(openSaleStanding(5900, [], [], NOW)).toEqual({
      balance: { paid: 0, pending: 5900 },
      linesLock: null,
      cancellable: true,
      cancelRefusal: null,
      refundsOnCancel: [],
      mercadoPagoChargeInProgress: null,
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
      mercadoPagoChargeInProgress: null,
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
      mercadoPagoChargeInProgress: null,
    });
  });

  it("locks the lines and refuses the cancellation by the QR charge in its wait while nothing is paid", () => {
    expect(openSaleStanding(5900, [], [QR_CHARGE_IN_ITS_WAIT], NOW)).toMatchObject({
      linesLock: "mercado_pago_charge_in_progress",
      cancellable: false,
      cancelRefusal: "mercado_pago_charge_in_progress",
      refundsOnCancel: [],
    });
  });

  it("keeps the lines locked by the approved payment and refuses the cancellation by the QR charge in its wait", () => {
    expect(openSaleStanding(5900, [CASH_PAYMENT], [QR_CHARGE_IN_ITS_WAIT], NOW)).toMatchObject({
      linesLock: "approved_payment",
      cancellable: false,
      cancelRefusal: "mercado_pago_charge_in_progress",
      refundsOnCancel: [],
    });
  });

  it("names the Mercado Pago charge in progress, so it can be followed", () => {
    expect(
      openSaleStanding(5900, [], [QR_CHARGE_PAST_ITS_WAIT, POINT_CHARGE_PAST_ITS_WAIT], NOW)
        .mercadoPagoChargeInProgress,
    ).toEqual({
      paymentTransactionId: "point-1",
      method: "POINT",
      amount: 4000,
      remainingSeconds: 0,
      waitSeconds: 180,
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

  it("keeps the lines locked and the cancellation refused by a terminal charge past its wait, as it can still be paid on the terminal", () => {
    expect(openSaleStanding(5900, [], [POINT_CHARGE_PAST_ITS_WAIT], NOW)).toMatchObject({
      linesLock: "mercado_pago_charge_in_progress",
      cancellable: false,
      cancelRefusal: "mercado_pago_charge_in_progress",
      refundsOnCancel: [],
    });
  });

  it("plans a pending refund for an approved QR payment, beside the cash one", () => {
    expect(openSaleStanding(5900, [CASH_PAYMENT, QR_PAYMENT], [], NOW)).toEqual({
      balance: { paid: 4000, pending: 1900 },
      linesLock: "approved_payment",
      cancellable: false,
      cancelRefusal: null,
      refundsOnCancel: [
        {
          paymentId: CASH_PAYMENT.id,
          method: "CASH",
          provider: CASH_PAYMENT.provider,
          amount: CASH_PAYMENT.amount,
          state: "APPROVED",
        },
        {
          paymentId: QR_PAYMENT.id,
          method: "QR",
          provider: QR_PAYMENT.provider,
          amount: QR_PAYMENT.amount,
          state: "PENDING",
        },
      ],
      mercadoPagoChargeInProgress: null,
    });
  });

  it("refuses the cancellation of a sale holding an approved integrated terminal payment, planning no refund", () => {
    expect(openSaleStanding(5900, [CASH_PAYMENT, POINT_PAYMENT], [], NOW)).toEqual({
      balance: { paid: 4000, pending: 1900 },
      linesLock: "approved_payment",
      cancellable: false,
      cancelRefusal: "holds_point_payment",
      refundsOnCancel: [],
      mercadoPagoChargeInProgress: null,
    });
  });

  it("plans a pending refund for an approved standalone terminal payment, beside the cash one", () => {
    expect(openSaleStanding(5900, [CASH_PAYMENT, STANDALONE_TERMINAL_PAYMENT], [], NOW)).toEqual({
      balance: { paid: 4000, pending: 1900 },
      linesLock: "approved_payment",
      cancellable: false,
      cancelRefusal: null,
      refundsOnCancel: [
        {
          paymentId: CASH_PAYMENT.id,
          method: "CASH",
          provider: CASH_PAYMENT.provider,
          amount: CASH_PAYMENT.amount,
          state: "APPROVED",
        },
        {
          paymentId: STANDALONE_TERMINAL_PAYMENT.id,
          method: "STANDALONE_TERMINAL",
          provider: STANDALONE_TERMINAL_PAYMENT.provider,
          amount: STANDALONE_TERMINAL_PAYMENT.amount,
          state: "PENDING",
        },
      ],
      mercadoPagoChargeInProgress: null,
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
    const pendingMercadoPagoPayment = fc.constantFrom(
      QR_CHARGE_IN_ITS_WAIT,
      QR_CHARGE_PAST_ITS_WAIT,
      POINT_CHARGE_PAST_ITS_WAIT,
    );

    fc.assert(
      fc.property(fc.array(payment), fc.array(pendingMercadoPagoPayment), (payments, pending) => {
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
    ["a QR charge is in its wait", [], [QR_CHARGE_IN_ITS_WAIT], "mercado_pago_charge_in_progress"],
    [
      "a terminal charge is past its wait",
      [],
      [POINT_CHARGE_PAST_ITS_WAIT],
      "mercado_pago_charge_in_progress",
    ],
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
    ["a QR charge is in its wait", [], [QR_CHARGE_IN_ITS_WAIT], "mercado_pago_charge_in_progress"],
    [
      "a terminal charge is past its wait",
      [],
      [POINT_CHARGE_PAST_ITS_WAIT],
      "mercado_pago_charge_in_progress",
    ],
    ["a QR payment is approved", [QR_PAYMENT], [], null],
    ["a terminal payment is approved", [POINT_PAYMENT], [], "holds_point_payment"],
    ["a standalone terminal payment is approved", [STANDALONE_TERMINAL_PAYMENT], [], null],
    [
      "a standalone terminal payment and a terminal payment are approved",
      [STANDALONE_TERMINAL_PAYMENT, POINT_PAYMENT],
      [],
      "holds_point_payment",
    ],
    [
      "a standalone terminal payment is approved and a QR charge is in its wait",
      [STANDALONE_TERMINAL_PAYMENT],
      [QR_CHARGE_IN_ITS_WAIT],
      "mercado_pago_charge_in_progress",
    ],
    [
      "a QR payment is approved and another QR charge is in its wait",
      [QR_PAYMENT],
      [QR_CHARGE_IN_ITS_WAIT],
      "mercado_pago_charge_in_progress",
    ],
  ] as const)("answers why cancelling is refused when %s", (_case, payments, pending, refusal) => {
    expect(saleCancelRefusal(payments, pending, NOW)).toBe(refusal);
  });
});
