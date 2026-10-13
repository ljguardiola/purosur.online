import { describe, expect, it } from "vitest";
import { confirmMercadoPagoRefund } from "./confirm-mercado-pago-refund.js";
import {
  aConfirmedRefund,
  aQrRefundOfCancelledSale,
  aSentRefund,
  NOW,
  refundWorld,
} from "./test-support/mercado-pago-refund-world.js";

function confirm(
  world: ReturnType<typeof refundWorld>,
  input: { refundId?: string; locationId?: string } = {},
) {
  return confirmMercadoPagoRefund(world.ports, {
    refundId: "refund-1",
    locationId: "branch-1",
    actorId: "manager",
    ...input,
  });
}

describe("confirmMercadoPagoRefund", () => {
  describe("when Mercado Pago takes the refund and leaves it in process", () => {
    it("records the confirmation and the refund as sent, leaving it pending", async () => {
      const world = refundWorld();

      const outcome = await confirm(world);

      expect(outcome).toEqual({ kind: "sent", refundId: "refund-1" });
      expect(world.store.refunds).toEqual([
        aQrRefundOfCancelledSale({
          confirmedBy: "manager",
          confirmedAt: NOW,
          attemptKey: "refund-key-1",
          sentAt: NOW,
          providerRefundId: "REF-1",
        }),
      ]);
      expect(world.store.resolvedAlerts).toEqual([]);
    });

    it("asks Mercado Pago to refund the order of the payment, once, with the attempt's key", async () => {
      const world = refundWorld();

      await confirm(world);

      expect(world.mercadoPago.refundRequests).toEqual([
        { orderId: "ORD-1", idempotencyKey: "refund-key-1" },
      ]);
    });

    it("commits the confirmation and the key before the call, and holds the payment's lane across both transactions", async () => {
      const world = refundWorld();

      await confirm(world);

      expect(world.lanes.operations).toEqual([
        "enterLane",
        "lockMercadoPagoRefund",
        "cancellationOfEvent",
        "recordRefundConfirmed",
        "refundOrder",
        "lockMercadoPagoRefund",
        "recordRefundSent",
        "leaveLane",
      ]);
      expect(world.lanes.lanesEntered).toEqual(["transaction-1"]);
      expect(world.mercadoPago.heldLaneDuringCall).toBe(true);
    });
  });

  describe("when Mercado Pago has already processed the refund", () => {
    it("marks the refund done by whoever confirmed it, at the moment of the answer, and resolves its task alert", async () => {
      const world = refundWorld();
      world.mercadoPago.refundAnswer = {
        kind: "refunded",
        providerRefundId: "REF-1",
        processed: true,
      };

      const outcome = await confirm(world);

      expect(outcome).toEqual({ kind: "done", refundId: "refund-1", doneAt: NOW });
      expect(world.store.refunds).toEqual([
        aQrRefundOfCancelledSale({
          state: "APPROVED",
          confirmedBy: "manager",
          confirmedAt: NOW,
          attemptKey: "refund-key-1",
          sentAt: NOW,
          providerRefundId: "REF-1",
          doneBy: "manager",
          doneAt: NOW,
        }),
      ]);
      expect(world.store.resolvedAlerts).toEqual([
        { refundId: "refund-1", kind: "refund_task", resolvedBy: "manager", resolvedAt: NOW },
      ]);
      expect(world.lanes.operations.slice(-5)).toEqual([
        "lockMercadoPagoRefund",
        "recordRefundSent",
        "recordRefundDone",
        "resolveRefundAlert",
        "leaveLane",
      ]);
    });
  });

  it("marks the refund done when Mercado Pago says the order was already refunded", async () => {
    const world = refundWorld();
    world.mercadoPago.refundAnswer = { kind: "already_refunded" };

    const outcome = await confirm(world);

    expect(outcome).toEqual({ kind: "done", refundId: "refund-1", doneAt: NOW });
    expect(world.store.refunds[0]).toMatchObject({
      state: "APPROVED",
      doneBy: "manager",
      providerRefundId: null,
    });
    expect(world.store.resolvedAlerts).toHaveLength(1);
  });

  it("keeps the refund pending, with the reason, and a fresh key for the next attempt, when the balance is insufficient", async () => {
    const world = refundWorld();
    world.mercadoPago.refundAnswer = { kind: "insufficient_balance" };

    const outcome = await confirm(world);

    expect(outcome).toEqual({ kind: "insufficient_balance", refundId: "refund-1" });
    expect(world.store.refunds).toEqual([
      aQrRefundOfCancelledSale({
        confirmedBy: "manager",
        confirmedAt: NOW,
        attemptKey: null,
        lastRefusalReason: "insufficient_balance",
      }),
    ]);
  });

  it("keeps the refund pending with the reason Mercado Pago gave when it refuses", async () => {
    const world = refundWorld();
    world.mercadoPago.refundAnswer = { kind: "refused", reason: "refund_period_exceeded" };

    const outcome = await confirm(world);

    expect(outcome).toEqual({
      kind: "refused",
      refundId: "refund-1",
      reason: "refund_period_exceeded",
    });
    expect(world.store.refunds[0]).toMatchObject({
      state: "PENDING",
      confirmedBy: "manager",
      lastRefusalReason: "refund_period_exceeded",
      sentAt: null,
    });
  });

  it("keeps the confirmation and the key when Mercado Pago cannot be reached, so the same request is repeated later", async () => {
    const world = refundWorld();
    world.mercadoPago.refundAnswer = { kind: "unavailable" };

    const outcome = await confirm(world);

    expect(outcome).toEqual({ kind: "provider_unavailable", refundId: "refund-1" });
    expect(world.store.refunds).toEqual([
      aQrRefundOfCancelledSale({
        confirmedBy: "manager",
        confirmedAt: NOW,
        attemptKey: "refund-key-1",
      }),
    ]);
  });

  describe("refusals, which send nothing and confirm nothing", () => {
    async function refusedWith(
      world: ReturnType<typeof refundWorld>,
      input: { refundId?: string; locationId?: string } = {},
    ) {
      const before = structuredClone(world.store.refunds);
      const outcome = await confirm(world, input);
      expect(world.mercadoPago.refundRequests).toEqual([]);
      expect(world.store.refunds).toEqual(before);
      return outcome;
    }

    it("answers not found for a refund that does not exist", async () => {
      expect(await refusedWith(refundWorld(), { refundId: "refund-9" })).toEqual({
        kind: "not_found",
      });
    });

    it("answers not found for a refund of another branch", async () => {
      expect(await refusedWith(refundWorld(), { locationId: "branch-2" })).toEqual({
        kind: "not_found",
      });
    });

    it.each([
      ["a late-payment refund", { origin: "late_payment" }],
      ["a refund of another method", { method: "TRANSFER" }],
      ["a refund that names no payment transaction", { paymentTransactionId: null }],
    ])("answers that %s is not confirmable", async (_case, change) => {
      const world = refundWorld([aQrRefundOfCancelledSale(change)]);

      expect(await refusedWith(world)).toEqual({ kind: "not_confirmable" });
      expect(world.lanes.lanesEntered).toEqual([]);
    });

    it("answers that a refund already done is done", async () => {
      const world = refundWorld([aSentRefund({ state: "APPROVED" })]);

      expect(await refusedWith(world)).toEqual({ kind: "already_done" });
    });

    it("answers that a refund already confirmed is confirmed, whoever confirmed it", async () => {
      const world = refundWorld([aConfirmedRefund()]);

      expect(await refusedWith(world)).toEqual({ kind: "already_confirmed" });
    });

    it("answers that a refund not backed by a cancelling event the cloud holds is not backed", async () => {
      const world = refundWorld();
      world.store.cancellations.clear();

      expect(await refusedWith(world)).toEqual({ kind: "refund_not_backed" });
    });

    it("answers that a refund whose event cancelled another sale is not backed", async () => {
      const world = refundWorld();
      world.store.cancellations.set("event-1", "sale-2");

      expect(await refusedWith(world)).toEqual({ kind: "refund_not_backed" });
    });

    it("answers that a refund without an origin event is not backed", async () => {
      const world = refundWorld([aQrRefundOfCancelledSale({ originEventId: null })]);

      expect(await refusedWith(world)).toEqual({ kind: "refund_not_backed" });
    });

    it("answers that a refund of a payment with no Mercado Pago order is not backed", async () => {
      const world = refundWorld([aQrRefundOfCancelledSale({ orderId: null })]);

      expect(await refusedWith(world)).toEqual({ kind: "refund_not_backed" });
    });

    it("answers that a refund over what the payment still holds exceeds what is refundable", async () => {
      const world = refundWorld([aQrRefundOfCancelledSale({ refundedOfPayment: 1 })]);

      expect(await refusedWith(world)).toEqual({ kind: "exceeds_refundable" });
    });
  });

  describe("when a write fails", () => {
    it("confirms nothing and sends nothing if recording the confirmation fails", async () => {
      const world = refundWorld();
      world.store.failOn = "recordRefundConfirmed";

      await expect(confirm(world)).rejects.toThrow("recordRefundConfirmed failed");

      expect(world.store.refunds).toEqual([aQrRefundOfCancelledSale()]);
      expect(world.mercadoPago.refundRequests).toEqual([]);
    });

    it("keeps the confirmation and the key if recording the answer fails, so the retry repeats the same request", async () => {
      const world = refundWorld();
      world.store.failOn = "recordRefundSent";

      await expect(confirm(world)).rejects.toThrow("recordRefundSent failed");

      expect(world.store.refunds).toEqual([
        aQrRefundOfCancelledSale({
          confirmedBy: "manager",
          confirmedAt: NOW,
          attemptKey: "refund-key-1",
        }),
      ]);
    });

    it("leaves the refund pending, still holding its alert, if marking it done fails", async () => {
      const world = refundWorld();
      world.mercadoPago.refundAnswer = { kind: "already_refunded" };
      world.store.failOn = "resolveRefundAlert";

      await expect(confirm(world)).rejects.toThrow("resolveRefundAlert failed");

      expect(world.store.refunds[0]).toMatchObject({ state: "PENDING", confirmedBy: "manager" });
      expect(world.store.resolvedAlerts).toEqual([]);
    });
  });
});
