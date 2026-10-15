import { describe, expect, it } from "vitest";
import { confirmMercadoPagoRefund } from "./confirm-mercado-pago-refund.js";
import {
  anApprovedLatePayment,
  aQrRefundOfLatePayment,
  NOW,
  refundWorld,
} from "./test-support/mercado-pago-refund-world.js";

function confirm(world: ReturnType<typeof refundWorld>) {
  return confirmMercadoPagoRefund(world.ports, {
    refundId: "refund-1",
    locationId: "branch-1",
    actorId: "manager",
  });
}

describe("confirmMercadoPagoRefund of a late QR payment", () => {
  it("asks Mercado Pago to refund the order the payment arrived on, once, with the attempt's key, and records it as sent", async () => {
    const world = refundWorld([aQrRefundOfLatePayment()]);

    const outcome = await confirm(world);

    expect(outcome).toEqual({ kind: "sent", refundId: "refund-1" });
    expect(world.mercadoPago.refundRequests).toEqual([
      { orderId: "ORD-1", idempotencyKey: "refund-key-1" },
    ]);
    expect(world.store.refunds[0]).toMatchObject({
      state: "PENDING",
      confirmedBy: "manager",
      confirmedAt: NOW,
      sentAt: NOW,
      providerRefundId: "REF-1",
    });
    expect(world.store.resolvedAlerts).toEqual([]);
  });

  it("checks the late payment, not a cancellation, commits the confirmation before the call, and holds the payment's lane across both transactions", async () => {
    const world = refundWorld([aQrRefundOfLatePayment()]);

    await confirm(world);

    expect(world.lanes.operations).toEqual([
      "enterLane",
      "lockMercadoPagoRefund",
      "latePaymentOfRefund",
      "recordRefundConfirmed",
      "refundOrder",
      "lockMercadoPagoRefund",
      "recordRefundSent",
      "leaveLane",
    ]);
  });

  it("marks the refund done and resolves its late-payment alert when Mercado Pago has processed it", async () => {
    const world = refundWorld([aQrRefundOfLatePayment()]);
    world.mercadoPago.refundAnswer = {
      kind: "refunded",
      providerRefundId: "REF-1",
      processed: true,
    };

    const outcome = await confirm(world);

    expect(outcome).toEqual({ kind: "done", refundId: "refund-1", doneAt: NOW });
    expect(world.store.refunds[0]).toMatchObject({ state: "APPROVED", doneBy: "manager" });
    expect(world.store.resolvedAlerts).toEqual([
      { refundId: "refund-1", kind: "late_payment_refund", resolvedBy: "manager", resolvedAt: NOW },
    ]);
  });

  it("keeps the refund pending, with the reason, and drops the key so the next attempt takes a fresh one, when the balance is insufficient", async () => {
    const world = refundWorld([aQrRefundOfLatePayment()]);
    world.mercadoPago.refundAnswer = { kind: "insufficient_balance" };

    const outcome = await confirm(world);

    expect(outcome).toEqual({ kind: "insufficient_balance", refundId: "refund-1" });
    expect(world.store.refunds[0]).toMatchObject({
      state: "PENDING",
      confirmedBy: "manager",
      attemptKey: null,
      lastRefusalReason: "insufficient_balance",
    });
  });

  it("refunds the paid order the cloud recorded when the payment arrived on another order than the one it created", async () => {
    const world = refundWorld([
      aQrRefundOfLatePayment({ orderId: "ORD-2", amount: 1800, paymentAmount: 1800 }),
    ]);
    world.store.latePayments.set(
      "refund-1",
      anApprovedLatePayment({ state: "EXPIRED", orderId: "ORD-1", otherOrderId: "ORD-2" }),
    );

    const outcome = await confirm(world);

    expect(outcome).toEqual({ kind: "sent", refundId: "refund-1" });
    expect(world.mercadoPago.refundRequests).toEqual([
      { orderId: "ORD-2", idempotencyKey: "refund-key-1" },
    ]);
  });

  describe("refusals, which send nothing and confirm nothing", () => {
    async function refusedWith(world: ReturnType<typeof refundWorld>) {
      const before = structuredClone(world.store.refunds);
      const outcome = await confirm(world);
      expect(world.mercadoPago.refundRequests).toEqual([]);
      expect(world.store.refunds).toEqual(before);
      return outcome;
    }

    it.each(["PENDING", "DECLINED", "CANCELLED", "EXPIRED"])(
      "answers that a refund whose payment the cloud holds as %s is not backed",
      async (state) => {
        const world = refundWorld([aQrRefundOfLatePayment()]);
        world.store.latePayments.set("refund-1", anApprovedLatePayment({ state }));

        expect(await refusedWith(world)).toEqual({ kind: "refund_not_backed" });
      },
    );

    it("answers that a refund whose payment the cloud does not hold is not backed", async () => {
      const world = refundWorld([aQrRefundOfLatePayment()]);
      world.store.latePayments.clear();

      expect(await refusedWith(world)).toEqual({ kind: "refund_not_backed" });
    });

    it("answers that a refund is not backed by a cancelling event a register claims", async () => {
      const world = refundWorld([aQrRefundOfLatePayment({ originEventId: "event-1" })]);
      world.store.latePayments.set("refund-1", anApprovedLatePayment({ state: "EXPIRED" }));

      expect(await refusedWith(world)).toEqual({ kind: "refund_not_backed" });
    });

    it("answers that a refund of a payment with no Mercado Pago order is not backed", async () => {
      const world = refundWorld([aQrRefundOfLatePayment({ orderId: null })]);

      expect(await refusedWith(world)).toEqual({ kind: "refund_not_backed" });
    });

    it("answers that a refund over what the late payment holds exceeds what is refundable", async () => {
      const world = refundWorld([aQrRefundOfLatePayment({ amount: 2451 })]);

      expect(await refusedWith(world)).toEqual({ kind: "exceeds_refundable" });
    });

    it("answers that a refund of a payment already refunded in part exceeds what is refundable", async () => {
      const world = refundWorld([aQrRefundOfLatePayment({ refundedOfPayment: 1 })]);

      expect(await refusedWith(world)).toEqual({ kind: "exceeds_refundable" });
    });

    it("answers that a late refund already confirmed is confirmed", async () => {
      const world = refundWorld([
        aQrRefundOfLatePayment({ confirmedBy: "other", confirmedAt: NOW, attemptKey: "key-0" }),
      ]);

      expect(await refusedWith(world)).toEqual({ kind: "already_confirmed" });
    });
  });
});
