import { describe, expect, it } from "vitest";
import { cancelMercadoPagoOrder } from "./cancel-mercado-pago-order.js";
import {
  mercadoPagoOrderWorld,
  orderResult,
  paidOrderResult,
  REGISTER_ID,
  storedPointTransaction,
  storedTransaction,
  TRANSACTION_ID,
} from "./test-support/mercado-pago-order-fixtures.js";

const INPUT = { registerId: REGISTER_ID, paymentTransactionId: TRANSACTION_ID };
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
});
