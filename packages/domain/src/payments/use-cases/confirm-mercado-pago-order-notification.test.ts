import { describe, expect, it } from "vitest";
import { confirmMercadoPagoOrderNotification } from "./confirm-mercado-pago-order-notification.js";
import {
  mercadoPagoQrOrderWorld,
  NOW,
  orderResult,
  paidOrderResult,
  storedTransaction,
  TRANSACTION_ID,
} from "./test-support/mercado-pago-qr-order-fixtures.js";

const WITH_ORDER = { providerOrderId: "order-1" };
const INPUT = { providerOrderId: "order-1" };

describe("confirmMercadoPagoOrderNotification", () => {
  it("approves the pending payment of the order when Mercado Pago says it was paid", async () => {
    const { lanes, mercadoPago, notificationPorts } = mercadoPagoQrOrderWorld({
      reading: { kind: "read", result: paidOrderResult() },
    });
    lanes.seed(storedTransaction(WITH_ORDER));

    const outcome = await confirmMercadoPagoOrderNotification(notificationPorts, INPUT);

    const expected = storedTransaction({ ...WITH_ORDER, state: "APPROVED" });
    expect(outcome).toEqual({ kind: "refreshed", transaction: expected });
    expect(lanes.transactions.get(TRANSACTION_ID)).toEqual(expected);
    expect(lanes.resultReadAt.get(TRANSACTION_ID)).toEqual(NOW);
    expect(mercadoPago.readOrders).toEqual(["order-1"]);
    expect(mercadoPago.heldLaneDuringCall).toBe(true);
  });

  it("leaves the payment as Mercado Pago's answer says, whatever the notification claimed", async () => {
    const { lanes, notificationPorts } = mercadoPagoQrOrderWorld({
      reading: { kind: "read", result: orderResult() },
    });
    lanes.seed(storedTransaction(WITH_ORDER));

    const outcome = await confirmMercadoPagoOrderNotification(notificationPorts, INPUT);

    expect(outcome).toMatchObject({ kind: "refreshed", transaction: { state: "PENDING" } });
    expect(lanes.transactions.get(TRANSACTION_ID)?.state).toBe("PENDING");
  });

  it("answers unknown order, reading nothing from Mercado Pago, when no payment has that order", async () => {
    const { lanes, mercadoPago, notificationPorts } = mercadoPagoQrOrderWorld();
    lanes.seed(storedTransaction({ providerOrderId: "order-2" }));

    expect(await confirmMercadoPagoOrderNotification(notificationPorts, INPUT)).toEqual({
      kind: "unknown_order",
    });
    expect(mercadoPago.readOrders).toEqual([]);
    expect(lanes.lanesEntered).toEqual([]);
  });

  it("answers unknown order when the payment is gone by the time its lane is held", async () => {
    const { directory, mercadoPago, notificationPorts } = mercadoPagoQrOrderWorld();
    directory.staleReferenceOfOrder = { id: TRANSACTION_ID, registerId: "register-1" };

    expect(await confirmMercadoPagoOrderNotification(notificationPorts, INPUT)).toEqual({
      kind: "unknown_order",
    });
    expect(mercadoPago.readOrders).toEqual([]);
  });

  it("answers provider unavailable and records nothing when Mercado Pago cannot be read", async () => {
    const { lanes, notificationPorts } = mercadoPagoQrOrderWorld({
      reading: { kind: "unavailable" },
    });
    lanes.seed(storedTransaction(WITH_ORDER));

    expect(await confirmMercadoPagoOrderNotification(notificationPorts, INPUT)).toEqual({
      kind: "provider_unavailable",
    });
    expect(lanes.operations).not.toContain("recordOrderResult");
    expect(lanes.transactions.get(TRANSACTION_ID)?.state).toBe("PENDING");
  });

  it("does not read again a payment that is no longer pending", async () => {
    const { lanes, mercadoPago, notificationPorts } = mercadoPagoQrOrderWorld({
      reading: { kind: "read", result: orderResult() },
    });
    lanes.seed(storedTransaction({ ...WITH_ORDER, state: "APPROVED" }));

    const outcome = await confirmMercadoPagoOrderNotification(notificationPorts, INPUT);

    expect(outcome).toMatchObject({ kind: "refreshed", transaction: { state: "APPROVED" } });
    expect(mercadoPago.readOrders).toEqual([]);
  });

  it("looks the payment up before taking its lane, and reads Mercado Pago only inside the lane", async () => {
    const { lanes, notificationPorts } = mercadoPagoQrOrderWorld();
    lanes.seed(storedTransaction(WITH_ORDER));

    await confirmMercadoPagoOrderNotification(notificationPorts, INPUT);

    expect(lanes.operations).toEqual([
      "paymentTransactionOfOrder order-1",
      "enterLane",
      "recordedTransaction",
      "readOrder",
      "recordOrderResult",
      "leaveLane",
    ]);
  });
});
