import { describe, expect, it } from "vitest";
import { confirmMercadoPagoOrderNotification } from "./confirm-mercado-pago-order-notification.js";
import {
  AMOUNT,
  mercadoPagoQrOrderWorld,
  NOW,
  orderResult,
  paidOrderResult,
  storedTransaction,
  TRANSACTION_ID,
} from "./test-support/mercado-pago-qr-order-fixtures.js";

const INPUT = { providerOrderId: "order-1" };
const AWAITING_ORDER = { creationOutcomeUnknown: true };

function paidOrderOf(externalReference: string | null) {
  return { ...paidOrderResult(), externalReference };
}

function worldReading(result: ReturnType<typeof paidOrderOf>) {
  return mercadoPagoQrOrderWorld({ reading: { kind: "read", result } });
}

describe("confirmMercadoPagoOrderNotification of an order no payment has recorded", () => {
  it("approves the payment whose order creation was unclear and records the order", async () => {
    const { lanes, notificationPorts } = worldReading(paidOrderOf(TRANSACTION_ID));
    lanes.seed(storedTransaction(AWAITING_ORDER));

    const outcome = await confirmMercadoPagoOrderNotification(notificationPorts, INPUT);

    const expected = storedTransaction({
      ...AWAITING_ORDER,
      providerOrderId: "order-1",
      state: "APPROVED",
    });
    expect(outcome).toEqual({ kind: "refreshed", transaction: expected });
    expect(lanes.transactions.get(TRANSACTION_ID)).toEqual(expected);
    expect(lanes.resultReadAt.get(TRANSACTION_ID)).toEqual(NOW);
    expect(lanes.latePaymentRefunds.size).toBe(0);
  });

  it("records the order and keeps the payment pending when the order is not paid yet", async () => {
    const { lanes, notificationPorts } = worldReading({
      ...orderResult(),
      externalReference: TRANSACTION_ID,
    });
    lanes.seed(storedTransaction(AWAITING_ORDER));

    const outcome = await confirmMercadoPagoOrderNotification(notificationPorts, INPUT);

    expect(outcome).toMatchObject({ kind: "refreshed", transaction: { state: "PENDING" } });
    expect(lanes.transactions.get(TRANSACTION_ID)).toMatchObject({
      providerOrderId: "order-1",
      state: "PENDING",
    });
  });

  it("opens the late payment refund task, never a refund, when the payment was replaced", async () => {
    const { lanes, mercadoPago, notificationPorts } = worldReading(paidOrderOf(TRANSACTION_ID));
    lanes.seed(storedTransaction({ ...AWAITING_ORDER, replaced: true }));

    await confirmMercadoPagoOrderNotification(notificationPorts, INPUT);

    expect([...lanes.latePaymentRefunds.values()].map(({ refund }) => refund)).toEqual([
      {
        paymentId: TRANSACTION_ID,
        method: "QR",
        provider: "MERCADOPAGO_QR",
        amount: AMOUNT,
        state: "PENDING",
        origin: "late_payment",
        providerOrderId: null,
      },
    ]);
    expect(mercadoPago.cancellations).toEqual([]);
  });

  it("records the order and opens the refund task in one storage transaction", async () => {
    const { lanes, notificationPorts } = worldReading(paidOrderOf(TRANSACTION_ID));
    lanes.seed(storedTransaction({ ...AWAITING_ORDER, replaced: true }));
    lanes.failOn = "openLatePaymentRefund";

    await expect(confirmMercadoPagoOrderNotification(notificationPorts, INPUT)).rejects.toThrow();

    expect(lanes.transactions.get(TRANSACTION_ID)).toEqual(
      storedTransaction({ ...AWAITING_ORDER, replaced: true }),
    );
    expect(lanes.latePaymentRefunds.size).toBe(0);
  });

  it("asks Mercado Pago nothing when no payment is waiting for an order", async () => {
    const { lanes, mercadoPago, notificationPorts } = worldReading(paidOrderOf(TRANSACTION_ID));
    lanes.seed(storedTransaction({ creationOutcomeUnknown: false }));

    expect(await confirmMercadoPagoOrderNotification(notificationPorts, INPUT)).toEqual({
      kind: "unknown_order",
    });
    expect(mercadoPago.readOrders).toEqual([]);
  });

  it("answers provider unavailable and records nothing when the order cannot be read", async () => {
    const { lanes, notificationPorts } = mercadoPagoQrOrderWorld({
      reading: { kind: "unavailable" },
    });
    lanes.seed(storedTransaction(AWAITING_ORDER));

    expect(await confirmMercadoPagoOrderNotification(notificationPorts, INPUT)).toEqual({
      kind: "provider_unavailable",
    });
    expect(lanes.transactions.get(TRANSACTION_ID)).toEqual(storedTransaction(AWAITING_ORDER));
  });

  it.each([
    ["has no external reference", paidOrderOf(null), AWAITING_ORDER],
    ["names no payment", paidOrderOf("transaction-9"), AWAITING_ORDER],
    ["names a payment that is not pending", paidOrderOf(TRANSACTION_ID), { state: "EXPIRED" }],
    [
      "names a payment whose creation created nothing",
      paidOrderOf(TRANSACTION_ID),
      { creationOutcomeUnknown: false },
    ],
  ] as const)("matches no payment when the order %s", async (_name, result, named) => {
    const { lanes, notificationPorts } = worldReading(result);
    lanes.seed(storedTransaction({ id: "transaction-2", ...AWAITING_ORDER }));
    lanes.seed(storedTransaction(named));
    const before = structuredClone([...lanes.transactions.values()]);

    expect(await confirmMercadoPagoOrderNotification(notificationPorts, INPUT)).toEqual({
      kind: "unknown_order",
    });
    expect([...lanes.transactions.values()]).toEqual(before);
    expect(lanes.latePaymentRefunds.size).toBe(0);
  });

  it("refreshes the payment as usual when its order was recorded while the notification was handled", async () => {
    const { lanes, directory, notificationPorts } = worldReading(paidOrderOf(TRANSACTION_ID));
    lanes.seed(storedTransaction(AWAITING_ORDER));
    directory.orderRecordedMeanwhile = "order-1";

    const outcome = await confirmMercadoPagoOrderNotification(notificationPorts, INPUT);

    expect(outcome).toMatchObject({
      kind: "refreshed",
      transaction: { state: "APPROVED", providerOrderId: "order-1" },
    });
    expect(lanes.operations).not.toContain("recordOrderCreated");
  });

  it("looks the payment up before taking its lane and records inside the lane", async () => {
    const { lanes, notificationPorts } = worldReading(paidOrderOf(TRANSACTION_ID));
    lanes.seed(storedTransaction(AWAITING_ORDER));

    await confirmMercadoPagoOrderNotification(notificationPorts, INPUT);

    expect(lanes.operations).toEqual([
      "paymentTransactionOfOrder order-1",
      "anyPaymentTransactionMayHaveUnrecordedOrder",
      "readOrder",
      `paymentTransactionOfExternalReference ${TRANSACTION_ID}`,
      "enterLane",
      "recordedTransaction",
      "recordOrderCreated",
      "leaveLane",
    ]);
  });
});
