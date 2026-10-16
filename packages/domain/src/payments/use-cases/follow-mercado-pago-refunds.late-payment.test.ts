import { describe, expect, it } from "vitest";
import { followMercadoPagoRefunds } from "./follow-mercado-pago-refunds.js";
import {
  aPaymentTransaction,
  aQrRefundOfLatePayment,
  NOW,
  refundWorld,
  SENT_AT,
} from "./test-support/mercado-pago-refund-world.js";

const CONFIRMED = { confirmedBy: "manager", confirmedAt: SENT_AT, attemptKey: "refund-key-0" };

describe("followMercadoPagoRefunds of a late QR payment", () => {
  it("never sends a late refund no person confirmed", async () => {
    const world = refundWorld([aQrRefundOfLatePayment()]);

    const outcome = await followMercadoPagoRefunds(world.ports);

    expect(outcome).toEqual({ kind: "followed", followed: 0, done: 0, unavailable: 0 });
    expect(world.mercadoPago.refundRequests).toEqual([]);
    expect(world.lanes.lanesEntered).toEqual([]);
  });

  it("sends again, with the same key, a confirmed late refund Mercado Pago could not be reached for", async () => {
    const world = refundWorld([aQrRefundOfLatePayment(CONFIRMED)]);

    const outcome = await followMercadoPagoRefunds(world.ports);

    expect(outcome).toEqual({ kind: "followed", followed: 1, done: 0, unavailable: 0 });
    expect(world.mercadoPago.refundRequests).toEqual([
      { orderId: "ORD-1", idempotencyKey: "refund-key-0" },
    ]);
    expect(world.store.refunds[0]).toMatchObject({ sentAt: NOW, providerRefundId: "REF-1" });
  });

  it("retries a late refund held for insufficient balance with a fresh key", async () => {
    const world = refundWorld([
      aQrRefundOfLatePayment({
        ...CONFIRMED,
        attemptKey: null,
        lastRefusalReason: "insufficient_balance",
      }),
    ]);

    await followMercadoPagoRefunds(world.ports);

    expect(world.mercadoPago.refundRequests).toEqual([
      { orderId: "ORD-1", idempotencyKey: "refund-key-1" },
    ]);
    expect(world.store.refunds[0]).toMatchObject({ lastRefusalReason: null, sentAt: NOW });
  });

  it("marks a sent late refund done, and resolves its late-payment alert, once a later read shows it processed", async () => {
    const world = refundWorld([
      aQrRefundOfLatePayment({ ...CONFIRMED, sentAt: SENT_AT, providerRefundId: "REF-1" }),
    ]);
    world.mercadoPago.orderRefunds = {
      kind: "read",
      refunds: [{ id: "REF-1", status: "processed" }],
    };

    const outcome = await followMercadoPagoRefunds(world.ports);

    expect(outcome).toEqual({ kind: "followed", followed: 1, done: 1, unavailable: 0 });
    expect(world.mercadoPago.refundRequests).toEqual([]);
    expect(world.store.refunds[0]).toMatchObject({ state: "APPROVED", doneBy: "manager" });
    expect(world.store.resolvedAlerts).toEqual([
      { refundId: "refund-1", kind: "late_payment_refund", resolvedBy: "manager", resolvedAt: NOW },
    ]);
  });

  it("sends nothing for a confirmed late refund whose payment the cloud no longer holds as approved", async () => {
    const world = refundWorld([
      aQrRefundOfLatePayment({
        ...CONFIRMED,
        paymentTransaction: aPaymentTransaction({ state: "EXPIRED" }),
      }),
    ]);

    await followMercadoPagoRefunds(world.ports);

    expect(world.mercadoPago.refundRequests).toEqual([]);
  });
});
