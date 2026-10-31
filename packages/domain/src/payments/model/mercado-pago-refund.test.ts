import { describe, expect, it } from "vitest";
import {
  alreadyRefundedOfPayment,
  amountHeldByRefundedPayment,
  INSUFFICIENT_BALANCE_REFUSAL,
  isAwaitingMercadoPago,
  isProcessedByMercadoPago,
  isRefundInCloudHands,
  isRefundRefusedForGood,
  isRefundSentByCloud,
  MERCADO_PAGO_REFUND_STAGES,
  mercadoPagoRefundStage,
  orderToRefund,
  partialAmountOfOrderRefund,
  progressOfRefundAnswer,
  recordedRefundOfCorrection,
  refundIsBackedByItsCorrection,
  refundIsBackedByItsLatePayment,
} from "./mercado-pago-refund.js";

describe("isRefundSentByCloud", () => {
  it.each([
    ["QR", "sale_cancelled", true],
    ["QR", "late_payment", true],
    ["QR", "manual", false],
    ["QR", "sale_voided", true],
    ["POINT", "sale_voided", true],
    ["TRANSFER", "sale_voided", false],
    ["CASH", "sale_voided", false],
    ["POINT", "late_payment", false],
    ["POINT", "sale_cancelled", true],
    ["TRANSFER", "sale_cancelled", false],
    ["CASH", "sale_cancelled", false],
    ["QR", "return", true],
    ["POINT", "return", true],
    ["TRANSFER", "return", false],
    ["STANDALONE_TERMINAL", "return", false],
    ["CASH", "return", false],
  ])("answers %s of origin %s: %s", (method, origin, sent) => {
    expect(isRefundSentByCloud({ method, origin })).toBe(sent);
  });
});

describe("isRefundRefusedForGood", () => {
  const confirmedAt = new Date("2026-10-13T14:00:00Z");

  it.each([
    ["QR", "sale_cancelled"],
    ["POINT", "sale_cancelled"],
    ["QR", "late_payment"],
    ["QR", "sale_voided"],
    ["POINT", "sale_voided"],
    ["QR", "return"],
    ["POINT", "return"],
  ])(
    "is true for a confirmed %s refund of origin %s Mercado Pago refused for good",
    (method, origin) => {
      expect(
        isRefundRefusedForGood({
          method,
          origin,
          confirmedAt,
          lastRefusalReason: "payment_not_refundable",
        }),
      ).toBe(true);
    },
  );

  it("is false while the refusal is only for insufficient balance", () => {
    expect(
      isRefundRefusedForGood({
        method: "QR",
        origin: "sale_cancelled",
        confirmedAt,
        lastRefusalReason: INSUFFICIENT_BALANCE_REFUSAL,
      }),
    ).toBe(false);
  });

  it("is false for a confirmed refund Mercado Pago has not refused", () => {
    expect(
      isRefundRefusedForGood({
        method: "QR",
        origin: "sale_cancelled",
        confirmedAt,
        lastRefusalReason: null,
      }),
    ).toBe(false);
  });

  it("is false for a refund no person confirmed", () => {
    expect(
      isRefundRefusedForGood({
        method: "QR",
        origin: "sale_cancelled",
        confirmedAt: null,
        lastRefusalReason: "payment_not_refundable",
      }),
    ).toBe(false);
  });

  it("is false for a refund the cloud does not send", () => {
    expect(
      isRefundRefusedForGood({
        method: "TRANSFER",
        origin: "sale_cancelled",
        confirmedAt,
        lastRefusalReason: "payment_not_refundable",
      }),
    ).toBe(false);
  });
});

describe("isRefundInCloudHands", () => {
  const CONFIRMED_AT = new Date("2026-10-07T10:05:00.000Z");

  it.each([
    ["QR", "sale_voided", "confirmed", null, true],
    ["POINT", "sale_voided", "confirmed", null, true],
    ["QR", "sale_cancelled", "confirmed", null, true],
    ["QR", "sale_voided", "confirmed", INSUFFICIENT_BALANCE_REFUSAL, true],
    ["POINT", "sale_voided", "confirmed", INSUFFICIENT_BALANCE_REFUSAL, true],
    ["QR", "sale_cancelled", "confirmed", INSUFFICIENT_BALANCE_REFUSAL, true],
    ["QR", "sale_voided", "confirmed", "rejected_by_bank", false],
    ["POINT", "sale_voided", "confirmed", "rejected_by_bank", false],
    ["QR", "sale_cancelled", "confirmed", "rejected_by_bank", false],
    ["QR", "sale_cancelled", "unconfirmed", null, false],
    ["QR", "sale_voided", "unconfirmed", null, false],
    ["TRANSFER", "sale_voided", "confirmed", null, false],
    ["POINT", "sale_cancelled", "confirmed", null, true],
    ["POINT", "sale_cancelled", "confirmed", INSUFFICIENT_BALANCE_REFUSAL, true],
    ["POINT", "sale_cancelled", "unconfirmed", null, false],
  ])(
    "answers a %s refund of origin %s, %s, last refused for %s: %s",
    (method, origin, confirmation, lastRefusalReason, inHands) => {
      const confirmedAt = confirmation === "confirmed" ? CONFIRMED_AT : null;
      expect(isRefundInCloudHands({ method, origin, confirmedAt, lastRefusalReason })).toBe(
        inHands,
      );
    },
  );
});

describe("recordedRefundOfCorrection", () => {
  const completion = { actorId: "cashier-1", at: new Date("2026-10-07T10:05:00.000Z") };
  const refund = (method: string) => ({
    id: "refund-1",
    paymentId: "payment-1",
    method,
    amount: 1000,
    state: "PENDING",
  });

  it.each([
    ["QR", "sale_voided"],
    ["POINT", "sale_voided"],
    ["QR", "return"],
    ["POINT", "return"],
  ] as const)(
    "records a %s refund of origin %s confirmed by whoever completed the correction, when they did, on the payment it refunds",
    (method, origin) => {
      expect(recordedRefundOfCorrection(refund(method), origin, completion)).toEqual({
        ...refund(method),
        origin,
        paymentTransactionId: "payment-1",
        confirmedBy: "cashier-1",
        confirmedAt: completion.at,
      });
    },
  );

  it.each([
    ["CASH", "sale_voided"],
    ["TRANSFER", "sale_voided"],
    ["STANDALONE_TERMINAL", "sale_voided"],
    ["CASH", "return"],
    ["TRANSFER", "return"],
    ["STANDALONE_TERMINAL", "return"],
  ] as const)(
    "records a %s refund of origin %s unconfirmed and on no payment transaction",
    (method, origin) => {
      expect(recordedRefundOfCorrection(refund(method), origin, completion)).toEqual({
        ...refund(method),
        origin,
        paymentTransactionId: null,
        confirmedBy: null,
        confirmedAt: null,
      });
    },
  );
});

describe("partialAmountOfOrderRefund", () => {
  const facts = {
    origin: "sale_cancelled",
    amount: 1000,
    ownOrderId: null,
    salePaymentAmount: 1000,
    refundedOfSalePayment: 0,
    paymentTransaction: { orderId: "ORD-1", amount: 1000, state: "APPROVED" },
    refundedOfPaymentTransactionByOrder: [],
  };

  it("is the refund's own amount for a return, which gives back part of the order", () => {
    expect(partialAmountOfOrderRefund({ ...facts, origin: "return" })).toBe(1000);
  });

  it.each(["sale_voided", "sale_cancelled", "late_payment"])(
    "is nothing for a refund of origin %s that gives back the whole payment",
    (origin) => {
      expect(partialAmountOfOrderRefund({ ...facts, origin })).toBeNull();
    },
  );

  it("is the refund's own amount for a late payment that gives back less than its transaction holds", () => {
    expect(
      partialAmountOfOrderRefund({
        ...facts,
        origin: "late_payment",
        amount: 400,
        paymentTransaction: { orderId: "ORD-1", amount: 1000, state: "APPROVED" },
      }),
    ).toBe(400);
  });

  it("is nothing for a late payment on an order the cloud did not create, which holds exactly what it refunds", () => {
    expect(
      partialAmountOfOrderRefund({
        ...facts,
        origin: "late_payment",
        amount: 400,
        ownOrderId: "ORD-2",
        paymentTransaction: null,
      }),
    ).toBeNull();
  });

  it("is nothing for a late payment whose transaction the cloud does not hold", () => {
    expect(
      partialAmountOfOrderRefund({
        ...facts,
        origin: "late_payment",
        amount: 400,
        paymentTransaction: null,
      }),
    ).toBeNull();
  });
});

describe("refundIsBackedByItsCorrection", () => {
  const refund = {
    saleId: "sale-1",
    origin: "sale_cancelled",
    originEventId: "event-1",
    orderId: "ORD1",
  };
  const cancellation = { origin: "sale_cancelled", saleId: "sale-1" };

  it("is backed when the event it came from cancelled the sale it refunds", () => {
    expect(refundIsBackedByItsCorrection(refund, cancellation)).toBe(true);
  });

  it("is backed when the event it came from voided the sale it refunds", () => {
    expect(
      refundIsBackedByItsCorrection(
        { ...refund, origin: "sale_voided" },
        { origin: "sale_voided", saleId: "sale-1" },
      ),
    ).toBe(true);
  });

  it("is backed when the event it came from is the return of the sale it refunds", () => {
    expect(
      refundIsBackedByItsCorrection(
        { ...refund, origin: "return" },
        { origin: "return", saleId: "sale-1" },
      ),
    ).toBe(true);
  });

  it("is not backed when a return's refund names a void", () => {
    expect(
      refundIsBackedByItsCorrection(
        { ...refund, origin: "return" },
        { origin: "sale_voided", saleId: "sale-1" },
      ),
    ).toBe(false);
  });

  it("is not backed when the event corrected another sale", () => {
    expect(refundIsBackedByItsCorrection(refund, { ...cancellation, saleId: "sale-2" })).toBe(
      false,
    );
  });

  it("is not backed when the event is another kind of correction than the one the refund names", () => {
    expect(refundIsBackedByItsCorrection(refund, { origin: "sale_voided", saleId: "sale-1" })).toBe(
      false,
    );
    expect(refundIsBackedByItsCorrection({ ...refund, origin: "sale_voided" }, cancellation)).toBe(
      false,
    );
  });

  it("is not backed when the cloud holds no correcting event for it", () => {
    expect(refundIsBackedByItsCorrection(refund, null)).toBe(false);
  });

  it("is not backed when the refund names no event", () => {
    expect(refundIsBackedByItsCorrection({ ...refund, originEventId: null }, cancellation)).toBe(
      false,
    );
  });

  it("is not backed when the payment has no Mercado Pago order to refund", () => {
    expect(refundIsBackedByItsCorrection({ ...refund, orderId: null }, cancellation)).toBe(false);
  });
});

describe("progressOfRefundAnswer", () => {
  it("is done when Mercado Pago already processed the refund it accepted", () => {
    expect(
      progressOfRefundAnswer({ kind: "refunded", providerRefundId: "REF1", processed: true }),
    ).toEqual({ kind: "done", providerRefundId: "REF1" });
  });

  it("is in process when Mercado Pago accepted the refund and has not processed it", () => {
    expect(
      progressOfRefundAnswer({ kind: "refunded", providerRefundId: "REF1", processed: false }),
    ).toEqual({ kind: "in_process", providerRefundId: "REF1" });
  });

  it("is done when the order was already refunded", () => {
    expect(progressOfRefundAnswer({ kind: "already_refunded" })).toEqual({
      kind: "done",
      providerRefundId: null,
    });
  });

  it("waits for balance when the account lacks money", () => {
    expect(progressOfRefundAnswer({ kind: "insufficient_balance" })).toEqual({
      kind: "waiting_for_balance",
    });
  });

  it("keeps the reason Mercado Pago gave when it refuses", () => {
    expect(progressOfRefundAnswer({ kind: "refused", reason: "refund_period_exceeded" })).toEqual({
      kind: "refused",
      reason: "refund_period_exceeded",
    });
  });

  it("is unknown when Mercado Pago could not be reached", () => {
    expect(progressOfRefundAnswer({ kind: "unavailable" })).toEqual({ kind: "unknown" });
  });
});

describe("isProcessedByMercadoPago", () => {
  it("is processed once the refund it accepted shows as processed", () => {
    expect(
      isProcessedByMercadoPago(
        [
          { id: "REF0", status: "processing" },
          { id: "REF1", status: "processed" },
        ],
        "REF1",
      ),
    ).toBe(true);
  });

  it("is still in process while the refund it accepted shows anything else", () => {
    expect(isProcessedByMercadoPago([{ id: "REF1", status: "processing" }], "REF1")).toBe(false);
  });

  it("is not processed by another refund of the order being processed", () => {
    expect(isProcessedByMercadoPago([{ id: "REF0", status: "processed" }], "REF1")).toBe(false);
  });
});

describe("isAwaitingMercadoPago", () => {
  const confirmed = { confirmedAt: new Date("2026-10-13T12:00:00.000Z"), lastRefusalReason: null };

  it("waits when a person confirmed it and nothing refused it", () => {
    expect(isAwaitingMercadoPago(confirmed)).toBe(true);
  });

  it("never waits while no person confirmed it", () => {
    expect(isAwaitingMercadoPago({ ...confirmed, confirmedAt: null })).toBe(false);
  });

  it("keeps waiting after Mercado Pago found the balance insufficient", () => {
    expect(
      isAwaitingMercadoPago({ ...confirmed, lastRefusalReason: INSUFFICIENT_BALANCE_REFUSAL }),
    ).toBe(true);
  });

  it("stops waiting once Mercado Pago refused it for another reason", () => {
    expect(
      isAwaitingMercadoPago({ ...confirmed, lastRefusalReason: "payment_not_refundable" }),
    ).toBe(false);
  });
});

describe("mercadoPagoRefundStage", () => {
  const unconfirmed = { confirmedAt: null, sentAt: null, lastRefusalReason: null };
  const confirmed = { ...unconfirmed, confirmedAt: new Date("2026-10-13T12:00:00.000Z") };
  const sent = { ...confirmed, sentAt: new Date("2026-10-13T12:00:02.000Z") };

  it.each([
    ["no person confirmed it", unconfirmed, "unconfirmed"],
    ["a person confirmed it and it was not sent yet", confirmed, "confirmed"],
    ["it was sent and nothing refused it", sent, "sent"],
    [
      "Mercado Pago found the balance insufficient",
      { ...sent, lastRefusalReason: INSUFFICIENT_BALANCE_REFUSAL },
      "waiting_for_balance",
    ],
    [
      "Mercado Pago refused it for another reason",
      { ...sent, lastRefusalReason: "payment_not_refundable" },
      "refused",
    ],
  ] as const)("answers how far it got when %s", (_case, refund, stage) => {
    expect(mercadoPagoRefundStage(refund)).toBe(stage);
  });

  it("names every stage it answers", () => {
    expect(MERCADO_PAGO_REFUND_STAGES).toEqual([
      "unconfirmed",
      "confirmed",
      "sent",
      "waiting_for_balance",
      "refused",
    ]);
  });
});

describe("refundIsBackedByItsLatePayment", () => {
  const approved = { orderId: "ORD-1", amount: 2450, state: "APPROVED" };
  const ofItsPayment = { ownOrderId: null, paymentTransaction: approved };

  it("is backed when the cloud holds the payment of its order as approved", () => {
    expect(refundIsBackedByItsLatePayment(ofItsPayment)).toBe(true);
  });

  it.each(["PENDING", "DECLINED", "CANCELLED", "EXPIRED"])(
    "is not backed when the cloud holds the payment as %s",
    (state) => {
      expect(
        refundIsBackedByItsLatePayment({
          ...ofItsPayment,
          paymentTransaction: { ...approved, state },
        }),
      ).toBe(false);
    },
  );

  it("is not backed when the payment has no order", () => {
    expect(
      refundIsBackedByItsLatePayment({
        ...ofItsPayment,
        paymentTransaction: { ...approved, orderId: null },
      }),
    ).toBe(false);
  });

  it("is not backed when the cloud holds no payment for it", () => {
    expect(refundIsBackedByItsLatePayment({ ownOrderId: null, paymentTransaction: null })).toBe(
      false,
    );
  });

  describe("when the paid order is another than the payment's own", () => {
    const expired = { ...approved, state: "EXPIRED" };

    it("is backed by the paid order the cloud recorded on it, whatever the payment's state", () => {
      expect(
        refundIsBackedByItsLatePayment({ ownOrderId: "ORD-2", paymentTransaction: expired }),
      ).toBe(true);
    });

    it("is not backed when the cloud holds no payment for it", () => {
      expect(
        refundIsBackedByItsLatePayment({ ownOrderId: "ORD-2", paymentTransaction: null }),
      ).toBe(false);
    });
  });
});

describe("orderToRefund", () => {
  const transaction = { orderId: "ORD-1", amount: 2450, state: "APPROVED" };

  it("is the order recorded on the refund itself when it has one", () => {
    expect(orderToRefund({ ownOrderId: "ORD-2", paymentTransaction: transaction })).toBe("ORD-2");
  });

  it("is the order of its payment transaction otherwise", () => {
    expect(orderToRefund({ ownOrderId: null, paymentTransaction: transaction })).toBe("ORD-1");
  });

  it("is none when neither the refund nor its payment transaction has an order", () => {
    expect(
      orderToRefund({ ownOrderId: null, paymentTransaction: { ...transaction, orderId: null } }),
    ).toBeNull();
    expect(orderToRefund({ ownOrderId: null, paymentTransaction: null })).toBeNull();
  });
});

describe("what the refunded payment holds", () => {
  const transaction = { orderId: "ORD-1", amount: 5000, state: "APPROVED" };
  const ofCancelledSale = {
    origin: "sale_cancelled",
    amount: 1000,
    ownOrderId: null,
    salePaymentAmount: 2450,
    refundedOfSalePayment: 300,
    paymentTransaction: transaction,
    refundedOfPaymentTransactionByOrder: [
      { orderId: null, amount: 700 },
      { orderId: "ORD-2", amount: 400 },
    ],
  };
  const ofLatePayment = { ...ofCancelledSale, origin: "late_payment" };
  const ofUnrecordedOrder = { ...ofLatePayment, ownOrderId: "ORD-2" };

  describe("amountHeldByRefundedPayment", () => {
    it("is the sale payment's amount for the refund of a sale", () => {
      expect(amountHeldByRefundedPayment(ofCancelledSale)).toBe(2450);
    });

    it("is nothing for the refund of a sale whose payment the cloud does not hold", () => {
      expect(amountHeldByRefundedPayment({ ...ofCancelledSale, salePaymentAmount: null })).toBe(0);
    });

    it("is the payment transaction's amount for the refund of a late payment of its own order", () => {
      expect(amountHeldByRefundedPayment(ofLatePayment)).toBe(5000);
    });

    it("is the refund's own amount for the refund of a late payment on an order the cloud did not create", () => {
      expect(amountHeldByRefundedPayment(ofUnrecordedOrder)).toBe(1000);
    });

    it("is nothing for the refund of a late payment whose transaction the cloud does not hold", () => {
      expect(amountHeldByRefundedPayment({ ...ofLatePayment, paymentTransaction: null })).toBe(0);
    });
  });

  describe("alreadyRefundedOfPayment", () => {
    it("counts the other refunds of the same sale payment for the refund of a sale", () => {
      expect(alreadyRefundedOfPayment(ofCancelledSale)).toBe(300);
    });

    it("counts only the other refunds of the transaction's own order for a late payment of it", () => {
      expect(alreadyRefundedOfPayment(ofLatePayment)).toBe(700);
    });

    it("counts only the other refunds of the same order for a late payment on an order the cloud did not create", () => {
      expect(alreadyRefundedOfPayment(ofUnrecordedOrder)).toBe(400);
    });

    it("counts nothing for a late payment whose order no other refund names", () => {
      expect(
        alreadyRefundedOfPayment({
          ...ofLatePayment,
          refundedOfPaymentTransactionByOrder: [{ orderId: "ORD-2", amount: 400 }],
        }),
      ).toBe(0);
    });
  });
});
