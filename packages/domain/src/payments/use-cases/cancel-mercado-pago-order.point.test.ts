import { describe, expect, it } from "vitest";
import { cancelMercadoPagoOrder } from "./cancel-mercado-pago-order.js";
import { createMercadoPagoPointOrder } from "./create-mercado-pago-point-order.js";
import {
  AMOUNT,
  mercadoPagoOrderWorld,
  NOW,
  orderResult,
  paidOrderResult,
  REGISTER_ID,
  SALE_ID,
  storedPointTransaction,
  storedTransaction,
  TRANSACTION_ID,
} from "./test-support/mercado-pago-order-fixtures.js";

const INPUT = {
  registerId: REGISTER_ID,
  paymentTransactionId: TRANSACTION_ID,
  saleId: SALE_ID,
  amount: AMOUNT,
  provider: "MERCADOPAGO_POINT",
} as const;
const ORDER_INPUT = {
  registerId: REGISTER_ID,
  paymentTransactionId: TRANSACTION_ID,
  saleId: SALE_ID,
  amount: AMOUNT,
};
const WITH_ORDER = { providerOrderId: "order-1" };
const AT_TERMINAL = orderResult({ status: "at_terminal", statusDetail: "at_terminal" });

function pointOrderThatCannotBeCancelled(rereadAs = AT_TERMINAL) {
  const world = mercadoPagoOrderWorld({ reading: { kind: "read", result: AT_TERMINAL } });
  world.mercadoPago.cancellation = { kind: "cannot_cancel" };
  world.mercadoPago.queuedReadings.push(
    { kind: "read", result: AT_TERMINAL },
    { kind: "read", result: rereadAs },
  );
  world.lanes.seed(storedPointTransaction(WITH_ORDER));
  return world;
}

describe("cancelMercadoPagoOrder on a Point order", () => {
  it("answers that it can only be cancelled on the terminal when Mercado Pago refuses because the order is at the terminal", async () => {
    const { lanes, mercadoPago, ports } = pointOrderThatCannotBeCancelled();

    const outcome = await cancelMercadoPagoOrder(ports, INPUT);

    expect(outcome).toEqual({
      kind: "cancel_on_terminal",
      transaction: storedPointTransaction(WITH_ORDER),
    });
    expect(lanes.transactions.get(TRANSACTION_ID)?.state).toBe("PENDING");
    expect(mercadoPago.cancellations).toHaveLength(1);
  });

  it("approves when the order turns out to be paid at the terminal while it was being cancelled", async () => {
    const { lanes, ports } = pointOrderThatCannotBeCancelled(paidOrderResult());

    const outcome = await cancelMercadoPagoOrder(ports, INPUT);

    expect(outcome).toMatchObject({ kind: "approved", transaction: { state: "APPROVED" } });
    expect(lanes.transactions.get(TRANSACTION_ID)?.state).toBe("APPROVED");
  });

  it.each([
    ["canceled", "CANCELLED"],
    ["expired", "EXPIRED"],
  ] as const)("answers closed when the terminal reports the order %s", async (status, state) => {
    const { lanes, ports } = pointOrderThatCannotBeCancelled(
      orderResult({ status, statusDetail: status }),
    );

    const outcome = await cancelMercadoPagoOrder(ports, INPUT);

    expect(outcome).toMatchObject({ kind: "already_closed", transaction: { state } });
    expect(lanes.transactions.get(TRANSACTION_ID)?.state).toBe(state);
  });

  it("answers unavailable, not on the terminal, when the order cannot be read again", async () => {
    const { mercadoPago, ports } = pointOrderThatCannotBeCancelled();
    mercadoPago.queuedReadings.pop();
    mercadoPago.reading = { kind: "unavailable" };

    expect(await cancelMercadoPagoOrder(ports, INPUT)).toEqual({ kind: "provider_unavailable" });
  });

  it("answers unavailable when Mercado Pago refuses to cancel an order that is not at the terminal", async () => {
    const { ports } = pointOrderThatCannotBeCancelled(orderResult());

    expect(await cancelMercadoPagoOrder(ports, INPUT)).toEqual({ kind: "provider_unavailable" });
  });

  it("cancels an order that has not reached the terminal", async () => {
    const world = mercadoPagoOrderWorld({ reading: { kind: "read", result: orderResult() } });
    world.mercadoPago.cancellation = {
      kind: "cancelled",
      result: orderResult({ status: "canceled", statusDetail: "canceled" }),
    };
    world.lanes.seed(storedPointTransaction(WITH_ORDER));

    const outcome = await cancelMercadoPagoOrder(world.ports, INPUT);

    expect(outcome).toMatchObject({ kind: "cancelled", transaction: { state: "CANCELLED" } });
  });

  it("does not take a QR order for one waiting on a terminal", async () => {
    const world = mercadoPagoOrderWorld({ reading: { kind: "read", result: AT_TERMINAL } });
    world.mercadoPago.cancellation = { kind: "cannot_cancel" };
    world.lanes.seed(storedTransaction(WITH_ORDER));

    expect(await cancelMercadoPagoOrder(world.ports, INPUT)).toEqual({
      kind: "provider_unavailable",
    });
  });

  describe("for a payment whose order request may still reach the cloud", () => {
    it("records it cancelled on the terminal's provider and never sends the late order to the terminal", async () => {
      const { lanes, mercadoPago, ports } = mercadoPagoOrderWorld();

      const cancellation = await cancelMercadoPagoOrder(ports, INPUT);
      const lateCreation = await createMercadoPagoPointOrder(ports, ORDER_INPUT);

      const cancelled = storedPointTransaction({
        state: "CANCELLED",
        createdAt: NOW,
        expiresAt: NOW,
      });
      expect(cancellation).toEqual({ kind: "cancelled", transaction: cancelled });
      expect(lateCreation).toEqual({ kind: "recorded", transaction: cancelled });
      expect(lanes.transactions.get(TRANSACTION_ID)).toEqual(cancelled);
      expect(mercadoPago.pointCreationRequests).toEqual([]);
    });

    it("refuses a late order that names another amount than the cancelled payment, without calling Mercado Pago", async () => {
      const { mercadoPago, ports } = mercadoPagoOrderWorld();
      await cancelMercadoPagoOrder(ports, INPUT);

      expect(
        await createMercadoPagoPointOrder(ports, { ...ORDER_INPUT, amount: AMOUNT + 1 }),
      ).toEqual({ kind: "request_mismatch" });
      expect(mercadoPago.pointCreationRequests).toEqual([]);
    });

    it("cancels through the order when the order request reached the lane first, leaving it to the terminal while it shows there", async () => {
      const { lanes, mercadoPago, ports } = mercadoPagoOrderWorld({
        pointCreation: { kind: "created", orderId: "order-1", result: AT_TERMINAL },
        reading: { kind: "read", result: AT_TERMINAL },
      });
      mercadoPago.cancellation = { kind: "cannot_cancel" };
      await createMercadoPagoPointOrder(ports, ORDER_INPUT);

      const outcome = await cancelMercadoPagoOrder(ports, INPUT);

      expect(outcome).toMatchObject({
        kind: "cancel_on_terminal",
        transaction: { state: "PENDING", providerOrderId: "order-1" },
      });
      expect(mercadoPago.cancellations).toHaveLength(1);
      expect(lanes.operations).not.toContain("recordCancelledWithoutOrder");
    });
  });
});
