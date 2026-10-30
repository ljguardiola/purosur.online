import { describe, expect, it } from "vitest";
import { followMercadoPagoRefunds } from "./follow-mercado-pago-refunds.js";
import {
  aRefundOfReturn,
  NOW,
  returnRefundWorld,
  SENT_AT,
} from "./test-support/mercado-pago-refund-world.js";

describe.each(["QR", "POINT"] as const)(
  "followMercadoPagoRefunds of a return of a sale paid by %s",
  (method) => {
    it("sends the refund the return recorded, once, for only its amount, to the order of the payment", async () => {
      const world = returnRefundWorld([aRefundOfReturn(method)]);

      const outcome = await followMercadoPagoRefunds(world.ports);

      expect(outcome).toEqual({ kind: "followed", followed: 1, done: 0, unavailable: 0 });
      expect(world.mercadoPago.refundRequests).toEqual([
        { orderId: "ORD-1", idempotencyKey: "refund-key-1", amount: 1000 },
      ]);
      expect(world.store.refunds[0]).toMatchObject({ sentAt: NOW, providerRefundId: "REF-1" });
    });

    it("sends what an earlier return left of the payment and nothing above it", async () => {
      const left = returnRefundWorld([
        aRefundOfReturn(method, { amount: 1450, refundedOfSalePayment: 1000 }),
      ]);
      const above = returnRefundWorld([
        aRefundOfReturn(method, { amount: 1451, refundedOfSalePayment: 1000 }),
      ]);

      await followMercadoPagoRefunds(left.ports);
      await followMercadoPagoRefunds(above.ports);

      expect(left.mercadoPago.refundRequests).toEqual([
        { orderId: "ORD-1", idempotencyKey: "refund-key-1", amount: 1450 },
      ]);
      expect(above.mercadoPago.refundRequests).toEqual([]);
    });

    it("sends nothing for a refund whose origin event is not the return the cloud holds", async () => {
      const world = returnRefundWorld([aRefundOfReturn(method)]);
      world.store.appliedCorrections.set("event-1", { origin: "sale_voided", saleId: "sale-1" });

      await followMercadoPagoRefunds(world.ports);

      expect(world.mercadoPago.refundRequests).toEqual([]);
    });

    it("sends nothing for a refund whose origin event returned another sale", async () => {
      const world = returnRefundWorld([aRefundOfReturn(method)]);
      world.store.appliedCorrections.set("event-1", { origin: "return", saleId: "sale-2" });

      await followMercadoPagoRefunds(world.ports);

      expect(world.mercadoPago.refundRequests).toEqual([]);
    });

    it("marks the refund done by whoever completed the return once a later read shows it processed", async () => {
      const world = returnRefundWorld([
        aRefundOfReturn(method, {
          attemptKey: "refund-key-0",
          sentAt: SENT_AT,
          providerRefundId: "REF-1",
        }),
      ]);
      world.mercadoPago.orderRefunds = {
        kind: "read",
        refunds: [{ id: "REF-1", status: "processed" }],
      };

      const outcome = await followMercadoPagoRefunds(world.ports);

      expect(outcome).toEqual({ kind: "followed", followed: 1, done: 1, unavailable: 0 });
      expect(world.store.refunds[0]).toMatchObject({
        state: "APPROVED",
        doneBy: "cashier",
        doneAt: NOW,
      });
    });

    it("keeps the refund pending while the balance is insufficient and retries it", async () => {
      const world = returnRefundWorld([aRefundOfReturn(method)]);
      world.mercadoPago.refundAnswer = { kind: "insufficient_balance" };

      await followMercadoPagoRefunds(world.ports);
      world.mercadoPago.refundAnswer = {
        kind: "refunded",
        providerRefundId: "REF-1",
        processed: false,
      };
      await followMercadoPagoRefunds(world.ports);

      expect(world.mercadoPago.refundRequests).toHaveLength(2);
      expect(world.store.refunds[0]).toMatchObject({ lastRefusalReason: null, sentAt: NOW });
    });
  },
);
