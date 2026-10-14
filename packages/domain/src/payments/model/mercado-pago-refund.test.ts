import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  exceedsRefundable,
  INSUFFICIENT_BALANCE_REFUSAL,
  isAwaitingMercadoPago,
  isProcessedByMercadoPago,
  isRefundSentByCloud,
  MERCADO_PAGO_REFUND_STAGES,
  mercadoPagoRefundStage,
  progressOfRefundAnswer,
  refundableAmount,
  refundIsBackedByItsCancellation,
} from "./mercado-pago-refund.js";

describe("isRefundSentByCloud", () => {
  it.each([
    ["QR", "sale_cancelled", true],
    ["QR", "late_payment", false],
    ["POINT", "sale_cancelled", false],
    ["TRANSFER", "sale_cancelled", false],
    ["CASH", "sale_cancelled", false],
  ])("answers %s of origin %s: %s", (method, origin, sent) => {
    expect(isRefundSentByCloud({ method, origin })).toBe(sent);
  });
});

describe("refundableAmount", () => {
  it("is what the payment holds less what is already refunded of it", () => {
    expect(refundableAmount(2450, 0)).toBe(2450);
    expect(refundableAmount(2450, 1000)).toBe(1450);
  });

  it("is never negative", () => {
    expect(refundableAmount(1000, 1500)).toBe(0);
  });

  it("is never more than the payment, nor does it count more than was refunded", () => {
    fc.assert(
      fc.property(fc.nat(1_000_000), fc.nat(1_000_000), (payment, refunded) => {
        const refundable = refundableAmount(payment, refunded);
        expect(refundable).toBeGreaterThanOrEqual(0);
        expect(refundable).toBeLessThanOrEqual(payment);
        expect(refundable + Math.min(refunded, payment)).toBe(payment);
      }),
    );
  });
});

describe("exceedsRefundable", () => {
  it("accepts a refund of exactly what is refundable", () => {
    expect(exceedsRefundable(1450, 2450, 1000)).toBe(false);
  });

  it("refuses a refund of one cent more than what is refundable", () => {
    expect(exceedsRefundable(1451, 2450, 1000)).toBe(true);
  });

  it("refuses any refund once the payment is fully refunded", () => {
    expect(exceedsRefundable(1, 2450, 2450)).toBe(true);
  });
});

describe("refundIsBackedByItsCancellation", () => {
  const refund = { saleId: "sale-1", originEventId: "event-1", orderId: "ORD1" };

  it("is backed when the event it came from cancelled the sale it refunds", () => {
    expect(refundIsBackedByItsCancellation(refund, { saleId: "sale-1" })).toBe(true);
  });

  it("is not backed when the event cancelled another sale", () => {
    expect(refundIsBackedByItsCancellation(refund, { saleId: "sale-2" })).toBe(false);
  });

  it("is not backed when the cloud holds no cancelling event for it", () => {
    expect(refundIsBackedByItsCancellation(refund, null)).toBe(false);
  });

  it("is not backed when the refund names no event", () => {
    expect(
      refundIsBackedByItsCancellation({ ...refund, originEventId: null }, { saleId: "sale-1" }),
    ).toBe(false);
  });

  it("is not backed when the payment has no Mercado Pago order to refund", () => {
    expect(
      refundIsBackedByItsCancellation({ ...refund, orderId: null }, { saleId: "sale-1" }),
    ).toBe(false);
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
