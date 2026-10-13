import { describe, expect, it } from "vitest";
import { confirmMercadoPagoOrderNotification } from "./confirm-mercado-pago-order-notification.js";
import {
  AMOUNT,
  mercadoPagoOrderWorld,
  NOW,
  orderResult,
  paidOrderResult,
  storedTransaction,
  TRANSACTION_ID,
} from "./test-support/mercado-pago-order-fixtures.js";

const INPUT = { providerOrderId: "order-2" };
const HOLDING_ANOTHER_ORDER = { providerOrderId: "order-1", creationOutcomeUnknown: true };

function worldReading(result: ReturnType<typeof orderResult>) {
  const world = mercadoPagoOrderWorld({ reading: { kind: "read", result } });
  world.lanes.seed(storedTransaction(HOLDING_ANOTHER_ORDER));
  return world;
}

function paidOrderNamingThePayment(paid = AMOUNT) {
  return { ...paidOrderResult(paid), externalReference: TRANSACTION_ID };
}

function openedRefunds(lanes: ReturnType<typeof mercadoPagoOrderWorld>["lanes"]) {
  return [...lanes.latePaymentRefunds.values()].map(({ refund }) => refund);
}

describe("confirmMercadoPagoOrderNotification of a paid order the payment did not record", () => {
  it("opens a late payment refund task for the order and its paid amount, leaving the payment as it is", async () => {
    const { lanes, mercadoPago, notificationPorts } = worldReading(paidOrderNamingThePayment(2300));

    const outcome = await confirmMercadoPagoOrderNotification(notificationPorts, INPUT);

    expect(outcome).toEqual({ kind: "late_payment_of_other_order" });
    expect(lanes.latePaymentRefunds.size).toBe(1);
    expect(openedRefunds(lanes)).toEqual([
      {
        paymentId: TRANSACTION_ID,
        method: "QR",
        provider: "MERCADOPAGO_QR",
        amount: 2300,
        state: "PENDING",
        origin: "late_payment",
        providerOrderId: "order-2",
      },
    ]);
    expect([...lanes.latePaymentRefunds.values()][0]?.openedAt).toEqual(NOW);
    expect(lanes.transactions.get(TRANSACTION_ID)).toEqual(
      storedTransaction(HOLDING_ANOTHER_ORDER),
    );
    expect(mercadoPago.cancellations).toEqual([]);
  });

  it("opens the task inside the payment's lane", async () => {
    const { lanes, notificationPorts } = worldReading(paidOrderNamingThePayment());

    await confirmMercadoPagoOrderNotification(notificationPorts, INPUT);

    expect(lanes.operations.slice(-4)).toEqual([
      "enterLane",
      "recordedTransaction",
      "openLatePaymentRefund",
      "leaveLane",
    ]);
  });

  it("opens the task whatever the state of the payment that holds another order", async () => {
    const { lanes, notificationPorts } = mercadoPagoOrderWorld({
      reading: { kind: "read", result: paidOrderNamingThePayment() },
    });
    lanes.seed(storedTransaction({ ...HOLDING_ANOTHER_ORDER, state: "APPROVED" }));

    expect(await confirmMercadoPagoOrderNotification(notificationPorts, INPUT)).toEqual({
      kind: "late_payment_of_other_order",
    });
  });

  it("opens no second task when the same order is notified again", async () => {
    const { lanes, notificationPorts } = worldReading(paidOrderNamingThePayment());

    await confirmMercadoPagoOrderNotification(notificationPorts, INPUT);
    const again = await confirmMercadoPagoOrderNotification(notificationPorts, INPUT);

    expect(again).toEqual({ kind: "late_payment_of_other_order" });
    expect(lanes.latePaymentRefunds.size).toBe(1);
  });

  it("opens a task for each different order the payment's reference is on", async () => {
    const { lanes, mercadoPago, notificationPorts } = worldReading(paidOrderNamingThePayment());

    await confirmMercadoPagoOrderNotification(notificationPorts, INPUT);
    mercadoPago.reading = { kind: "read", result: paidOrderNamingThePayment() };
    await confirmMercadoPagoOrderNotification(notificationPorts, { providerOrderId: "order-3" });

    expect(openedRefunds(lanes).map((refund) => refund.providerOrderId)).toEqual([
      "order-2",
      "order-3",
    ]);
  });

  it("opens nothing for an order that is not paid", async () => {
    const { lanes, notificationPorts } = worldReading({
      ...orderResult(),
      externalReference: TRANSACTION_ID,
    });

    expect(await confirmMercadoPagoOrderNotification(notificationPorts, INPUT)).toEqual({
      kind: "unknown_order",
    });
    expect(lanes.latePaymentRefunds.size).toBe(0);
  });

  it("asks Mercado Pago nothing when no payment's order creation was unclear", async () => {
    const { lanes, mercadoPago, notificationPorts } = mercadoPagoOrderWorld({
      reading: { kind: "read", result: paidOrderNamingThePayment() },
    });
    lanes.seed(storedTransaction({ ...HOLDING_ANOTHER_ORDER, creationOutcomeUnknown: false }));

    expect(await confirmMercadoPagoOrderNotification(notificationPorts, INPUT)).toEqual({
      kind: "unknown_order",
    });
    expect(mercadoPago.readOrders).toEqual([]);
    expect(lanes.latePaymentRefunds.size).toBe(0);
  });

  it("opens nothing for a payment that waits for an order, as that order is recorded for it", async () => {
    const { lanes, notificationPorts } = mercadoPagoOrderWorld({
      reading: { kind: "read", result: paidOrderNamingThePayment() },
    });
    lanes.seed(storedTransaction({ creationOutcomeUnknown: true }));

    const outcome = await confirmMercadoPagoOrderNotification(notificationPorts, INPUT);

    expect(outcome).toMatchObject({ kind: "refreshed" });
    expect(lanes.latePaymentRefunds.size).toBe(0);
  });
});
