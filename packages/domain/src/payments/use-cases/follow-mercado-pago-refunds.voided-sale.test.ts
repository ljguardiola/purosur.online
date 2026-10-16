import { describe, expect, it } from "vitest";
import { followMercadoPagoRefunds } from "./follow-mercado-pago-refunds.js";
import {
  aRefundOfVoidedSale,
  NOW,
  SENT_AT,
  voidedSaleRefundWorld,
} from "./test-support/mercado-pago-refund-world.js";

describe.each(["QR", "POINT"] as const)(
  "followMercadoPagoRefunds of a voided sale paid by %s",
  (method) => {
    it("sends the refund the cashier confirmed, once, to the order of the payment", async () => {
      const world = voidedSaleRefundWorld([aRefundOfVoidedSale(method)]);

      const outcome = await followMercadoPagoRefunds(world.ports);

      expect(outcome).toEqual({ kind: "followed", followed: 1, done: 0, unavailable: 0 });
      expect(world.mercadoPago.refundRequests).toEqual([
        { orderId: "ORD-1", idempotencyKey: "refund-key-1" },
      ]);
      expect(world.store.refunds[0]).toMatchObject({ sentAt: NOW, providerRefundId: "REF-1" });
    });

    it("sends nothing for a refund no cashier confirmed", async () => {
      const world = voidedSaleRefundWorld([aRefundOfVoidedSale(method, { confirmedAt: null })]);

      await followMercadoPagoRefunds(world.ports);

      expect(world.mercadoPago.refundRequests).toEqual([]);
    });

    it("sends nothing for a refund whose origin event is not a void the cloud holds", async () => {
      const world = voidedSaleRefundWorld([aRefundOfVoidedSale(method)]);
      world.store.appliedCorrections.clear();

      const outcome = await followMercadoPagoRefunds(world.ports);

      expect(outcome).toEqual({ kind: "followed", followed: 1, done: 0, unavailable: 0 });
      expect(world.mercadoPago.refundRequests).toEqual([]);
    });

    it("sends nothing for a refund whose origin event voided another sale", async () => {
      const world = voidedSaleRefundWorld([aRefundOfVoidedSale(method)]);
      world.store.appliedCorrections.set("event-1", { origin: "sale_voided", saleId: "sale-2" });

      await followMercadoPagoRefunds(world.ports);

      expect(world.mercadoPago.refundRequests).toEqual([]);
    });

    it("sends nothing for a refund whose origin event is a cancellation, not a void", async () => {
      const world = voidedSaleRefundWorld([aRefundOfVoidedSale(method)]);
      world.store.appliedCorrections.set("event-1", { origin: "sale_cancelled", saleId: "sale-1" });

      await followMercadoPagoRefunds(world.ports);

      expect(world.mercadoPago.refundRequests).toEqual([]);
    });

    it("sends nothing for a refund of more than what the payment still holds", async () => {
      const world = voidedSaleRefundWorld([
        aRefundOfVoidedSale(method, { refundedOfSalePayment: 100 }),
      ]);

      await followMercadoPagoRefunds(world.ports);

      expect(world.mercadoPago.refundRequests).toEqual([]);
    });

    it("marks the refund done by whoever confirmed it once a later read shows it processed", async () => {
      const world = voidedSaleRefundWorld([
        aRefundOfVoidedSale(method, {
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

    it("keeps the refund pending with its reason while the balance is insufficient, and retries it", async () => {
      const world = voidedSaleRefundWorld([aRefundOfVoidedSale(method)]);
      world.mercadoPago.refundAnswer = { kind: "insufficient_balance" };

      await followMercadoPagoRefunds(world.ports);

      expect(world.store.refunds[0]).toMatchObject({
        state: "PENDING",
        lastRefusalReason: "insufficient_balance",
        attemptKey: null,
      });

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

describe("followMercadoPagoRefunds of a cancelled sale paid by Point", () => {
  it("sends nothing, the refund stays manual", async () => {
    const world = voidedSaleRefundWorld([
      aRefundOfVoidedSale("POINT", { origin: "sale_cancelled" }),
    ]);
    world.store.appliedCorrections.set("event-1", { origin: "sale_cancelled", saleId: "sale-1" });

    const outcome = await followMercadoPagoRefunds(world.ports);

    expect(outcome).toEqual({ kind: "followed", followed: 0, done: 0, unavailable: 0 });
    expect(world.mercadoPago.refundRequests).toEqual([]);
  });
});
