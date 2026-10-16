import { describe, expect, it } from "vitest";
import { followMercadoPagoRefunds } from "./follow-mercado-pago-refunds.js";
import {
  aConfirmedRefund,
  aPaymentTransaction,
  aQrRefundOfCancelledSale,
  aSentRefund,
  NOW,
  refundWorld,
  SENT_AT,
} from "./test-support/mercado-pago-refund-world.js";

describe("followMercadoPagoRefunds", () => {
  it("never sends a refund no person confirmed", async () => {
    const world = refundWorld([aQrRefundOfCancelledSale()]);

    const outcome = await followMercadoPagoRefunds(world.ports);

    expect(outcome).toEqual({ kind: "followed", followed: 0, done: 0, unavailable: 0 });
    expect(world.mercadoPago.refundRequests).toEqual([]);
    expect(world.mercadoPago.refundReadings).toEqual([]);
    expect(world.lanes.lanesEntered).toEqual([]);
  });

  it("sends again, with the same key, a confirmed refund Mercado Pago could not be reached for", async () => {
    const world = refundWorld([aConfirmedRefund()]);

    const outcome = await followMercadoPagoRefunds(world.ports);

    expect(outcome).toEqual({ kind: "followed", followed: 1, done: 0, unavailable: 0 });
    expect(world.mercadoPago.refundRequests).toEqual([
      { orderId: "ORD-1", idempotencyKey: "refund-key-0" },
    ]);
    expect(world.store.refunds[0]).toMatchObject({
      sentAt: NOW,
      providerRefundId: "REF-1",
      state: "PENDING",
    });
  });

  it("keeps repeating the same request while Mercado Pago cannot be reached", async () => {
    const world = refundWorld([aConfirmedRefund()]);
    world.mercadoPago.refundAnswer = { kind: "unavailable" };

    const outcome = await followMercadoPagoRefunds(world.ports);
    await followMercadoPagoRefunds(world.ports);

    expect(outcome).toEqual({ kind: "followed", followed: 1, done: 0, unavailable: 1 });
    expect(world.mercadoPago.refundRequests.map(({ idempotencyKey }) => idempotencyKey)).toEqual([
      "refund-key-0",
      "refund-key-0",
    ]);
    expect(world.store.refunds[0]).toMatchObject({ sentAt: null, attemptKey: "refund-key-0" });
  });

  it("retries a refund held for insufficient balance with a fresh key, and records its progress", async () => {
    const world = refundWorld([
      aConfirmedRefund({ attemptKey: null, lastRefusalReason: "insufficient_balance" }),
    ]);

    await followMercadoPagoRefunds(world.ports);

    expect(world.mercadoPago.refundRequests).toEqual([
      { orderId: "ORD-1", idempotencyKey: "refund-key-1" },
    ]);
    expect(world.store.refunds[0]).toMatchObject({
      attemptKey: "refund-key-1",
      sentAt: NOW,
      lastRefusalReason: null,
    });
  });

  it("holds the refund again, with a fresh key later, while the balance stays insufficient", async () => {
    const world = refundWorld([
      aConfirmedRefund({ attemptKey: null, lastRefusalReason: "insufficient_balance" }),
    ]);
    world.mercadoPago.refundAnswer = { kind: "insufficient_balance" };

    await followMercadoPagoRefunds(world.ports);
    await followMercadoPagoRefunds(world.ports);

    expect(world.mercadoPago.refundRequests.map(({ idempotencyKey }) => idempotencyKey)).toEqual([
      "refund-key-1",
      "refund-key-2",
    ]);
  });

  it("does not send again a refund Mercado Pago refused for a reason that will not change", async () => {
    const world = refundWorld([aConfirmedRefund({ lastRefusalReason: "payment_not_refundable" })]);

    const outcome = await followMercadoPagoRefunds(world.ports);

    expect(outcome).toEqual({ kind: "followed", followed: 0, done: 0, unavailable: 0 });
    expect(world.mercadoPago.refundRequests).toEqual([]);
  });

  it("marks a refund sent in process as done by whoever confirmed it, at the moment it read it processed", async () => {
    const world = refundWorld([aSentRefund()]);
    world.mercadoPago.orderRefunds = {
      kind: "read",
      refunds: [{ id: "REF-1", status: "processed" }],
    };

    const outcome = await followMercadoPagoRefunds(world.ports);

    expect(outcome).toEqual({ kind: "followed", followed: 1, done: 1, unavailable: 0 });
    expect(world.mercadoPago.refundReadings).toEqual(["ORD-1"]);
    expect(world.mercadoPago.refundRequests).toEqual([]);
    expect(world.store.refunds[0]).toMatchObject({
      state: "APPROVED",
      doneBy: "manager",
      doneAt: NOW,
      sentAt: SENT_AT,
    });
    expect(world.store.resolvedAlerts).toEqual([
      { refundId: "refund-1", kind: "refund_task", resolvedBy: "manager", resolvedAt: NOW },
    ]);
  });

  it("leaves a refund pending while Mercado Pago still shows it in process", async () => {
    const world = refundWorld([aSentRefund()]);
    world.mercadoPago.orderRefunds = {
      kind: "read",
      refunds: [{ id: "REF-1", status: "processing" }],
    };

    const outcome = await followMercadoPagoRefunds(world.ports);

    expect(outcome).toEqual({ kind: "followed", followed: 1, done: 0, unavailable: 0 });
    expect(world.store.refunds).toEqual([aSentRefund()]);
    expect(world.store.resolvedAlerts).toEqual([]);
  });

  it("leaves a refund pending, counting it as unavailable, when the read fails", async () => {
    const world = refundWorld([aSentRefund()]);
    world.mercadoPago.orderRefunds = { kind: "unavailable" };

    const outcome = await followMercadoPagoRefunds(world.ports);

    expect(outcome).toEqual({ kind: "followed", followed: 1, done: 0, unavailable: 1 });
    expect(world.store.refunds[0]?.state).toBe("PENDING");
  });

  it("sends nothing for a confirmed refund whose cancellation the cloud no longer holds", async () => {
    const world = refundWorld([aConfirmedRefund()]);
    world.store.cancellations.clear();

    const outcome = await followMercadoPagoRefunds(world.ports);

    expect(outcome).toEqual({ kind: "followed", followed: 1, done: 0, unavailable: 0 });
    expect(world.mercadoPago.refundRequests).toEqual([]);
  });

  it("sends nothing for a refund that now exceeds what the payment still holds", async () => {
    const world = refundWorld([aConfirmedRefund({ refundedOfSalePayment: 100 })]);

    await followMercadoPagoRefunds(world.ports);

    expect(world.mercadoPago.refundRequests).toEqual([]);
  });

  it("follows each refund inside the lane of its own payment transaction, one after another", async () => {
    const world = refundWorld([
      aConfirmedRefund(),
      aConfirmedRefund({
        id: "refund-2",
        saleId: "sale-2",
        paymentTransactionId: "transaction-2",
        paymentTransaction: aPaymentTransaction({ orderId: "ORD-2" }),
        originEventId: "event-2",
      }),
    ]);
    world.store.cancellations.set("event-2", "sale-2");

    const outcome = await followMercadoPagoRefunds(world.ports);

    expect(outcome).toEqual({ kind: "followed", followed: 2, done: 0, unavailable: 0 });
    expect(world.lanes.lanesEntered).toEqual(["transaction-1", "transaction-2"]);
    expect(world.mercadoPago.refundRequests.map(({ orderId }) => orderId)).toEqual([
      "ORD-1",
      "ORD-2",
    ]);
  });

  it("ignores a refund a person already carried out", async () => {
    const world = refundWorld([aSentRefund({ state: "APPROVED" })]);

    const outcome = await followMercadoPagoRefunds(world.ports);

    expect(outcome).toEqual({ kind: "followed", followed: 0, done: 0, unavailable: 0 });
  });

  it("ignores a late POINT payment refund, which stays manual", async () => {
    const world = refundWorld([aConfirmedRefund({ origin: "late_payment", method: "POINT" })]);

    const outcome = await followMercadoPagoRefunds(world.ports);

    expect(outcome).toEqual({ kind: "followed", followed: 0, done: 0, unavailable: 0 });
    expect(world.mercadoPago.refundRequests).toEqual([]);
  });

  it("sends again a refund whose provider refund is known but whose sending was never recorded", async () => {
    const world = refundWorld([aConfirmedRefund({ providerRefundId: "REF-1", sentAt: null })]);

    const outcome = await followMercadoPagoRefunds(world.ports);

    expect(outcome).toEqual({ kind: "followed", followed: 1, done: 0, unavailable: 0 });
    expect(world.mercadoPago.refundReadings).toEqual([]);
    expect(world.mercadoPago.refundRequests).toEqual([
      { orderId: "ORD-1", idempotencyKey: "refund-key-0" },
    ]);
  });

  it("refuses to follow a refund marked confirmed without the person who confirmed it", async () => {
    const world = refundWorld([aConfirmedRefund({ confirmedBy: null })]);

    await expect(followMercadoPagoRefunds(world.ports)).rejects.toThrow(
      "refund refund-1 is sent without a person's confirmation",
    );
    expect(world.mercadoPago.refundRequests).toEqual([]);
  });

  describe("when a refund changes after it was listed and before it is followed", () => {
    function changedAfterListing(
      world: ReturnType<typeof refundWorld>,
      change: (refunds: typeof world.store.refunds) => void,
    ) {
      const list = world.store.confirmedPendingRefunds.bind(world.store);
      world.store.confirmedPendingRefunds = async () => {
        const listed = await list();
        change(world.store.refunds);
        return listed;
      };
    }

    it("sends nothing for a refund that is no longer stored", async () => {
      const world = refundWorld([aConfirmedRefund()]);
      changedAfterListing(world, (refunds) => refunds.splice(0));

      const outcome = await followMercadoPagoRefunds(world.ports);

      expect(outcome).toEqual({ kind: "followed", followed: 0, done: 0, unavailable: 0 });
      expect(world.mercadoPago.refundRequests).toEqual([]);
    });

    it("sends nothing for a refund a person carried out meanwhile", async () => {
      const world = refundWorld([aConfirmedRefund()]);
      changedAfterListing(world, ([refund]) => {
        if (refund) refund.state = "APPROVED";
      });

      const outcome = await followMercadoPagoRefunds(world.ports);

      expect(outcome).toEqual({ kind: "followed", followed: 0, done: 0, unavailable: 0 });
      expect(world.mercadoPago.refundRequests).toEqual([]);
    });

    it("sends nothing for a refund Mercado Pago refused meanwhile for a reason that will not change", async () => {
      const world = refundWorld([aConfirmedRefund()]);
      changedAfterListing(world, ([refund]) => {
        if (refund) refund.lastRefusalReason = "payment_not_refundable";
      });

      const outcome = await followMercadoPagoRefunds(world.ports);

      expect(outcome).toEqual({ kind: "followed", followed: 0, done: 0, unavailable: 0 });
      expect(world.mercadoPago.refundRequests).toEqual([]);
    });
  });
});
