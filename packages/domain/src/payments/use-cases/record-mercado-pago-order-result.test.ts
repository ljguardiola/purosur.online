import { describe, expect, it } from "vitest";
import { cancelMercadoPagoOrder } from "./cancel-mercado-pago-order.js";
import { checkPendingMercadoPagoPayments } from "./check-pending-mercado-pago-payments.js";
import { confirmMercadoPagoOrderNotification } from "./confirm-mercado-pago-order-notification.js";
import { recordMercadoPagoOrderResult } from "./record-mercado-pago-order-result.js";
import {
  AMOUNT,
  mercadoPagoOrderWorld,
  NOW,
  orderResult,
  paidOrderResult,
  REGISTER_ID,
  storedTransaction,
  TRANSACTION_ID,
} from "./test-support/mercado-pago-order-fixtures.js";

const WITH_ORDER = { providerOrderId: "order-1" };
const LATE_PAYMENT_REFUND = {
  paymentId: TRANSACTION_ID,
  method: "QR",
  provider: "MERCADOPAGO_QR",
  amount: AMOUNT,
  state: "PENDING",
  origin: "late_payment",
  providerOrderId: null,
};

function record(
  world: ReturnType<typeof mercadoPagoOrderWorld>,
  transaction = storedTransaction(WITH_ORDER),
  result = paidOrderResult(),
) {
  return world.lanes.inPaymentTransactionLane(TRANSACTION_ID, (lane) =>
    recordMercadoPagoOrderResult(lane, transaction, result, NOW),
  );
}

describe("recordMercadoPagoOrderResult", () => {
  it("opens the pending refund task of a payment Mercado Pago approved after the register replaced it, with the approval", async () => {
    const world = mercadoPagoOrderWorld();
    world.lanes.seed(storedTransaction({ ...WITH_ORDER, replaced: true }));

    const recorded = await record(world, storedTransaction({ ...WITH_ORDER, replaced: true }));

    expect(recorded).toMatchObject({ state: "APPROVED", replaced: true });
    expect(world.lanes.transactions.get(TRANSACTION_ID)?.state).toBe("APPROVED");
    expect([...world.lanes.latePaymentRefunds.values()]).toEqual([
      { refund: LATE_PAYMENT_REFUND, openedAt: NOW },
    ]);
    expect(world.lanes.operations).toEqual([
      "enterLane",
      "recordOrderResult",
      "openLatePaymentRefund",
      "leaveLane",
    ]);
  });

  it("refunds the payment by the channel it came in and sends nothing to Mercado Pago", async () => {
    const world = mercadoPagoOrderWorld();
    world.lanes.seed(storedTransaction({ ...WITH_ORDER, replaced: true }));

    await record(world, storedTransaction({ ...WITH_ORDER, replaced: true }));

    const [task] = [...world.lanes.latePaymentRefunds.values()];
    expect(task?.refund).toMatchObject({ method: "QR", provider: "MERCADOPAGO_QR" });
    expect(task?.refund.method).not.toBe("CASH");
    expect(world.mercadoPago.cancellations).toEqual([]);
    expect(world.mercadoPago.creationRequests).toEqual([]);
  });

  it("opens no task for a payment approved while the register still waited on it", async () => {
    const world = mercadoPagoOrderWorld();
    world.lanes.seed(storedTransaction(WITH_ORDER));

    await record(world);

    expect(world.lanes.transactions.get(TRANSACTION_ID)?.state).toBe("APPROVED");
    expect(world.lanes.latePaymentRefunds.size).toBe(0);
    expect(world.lanes.operations).not.toContain("openLatePaymentRefund");
  });

  it.each([
    ["cancelled", orderResult({ status: "canceled", statusDetail: "canceled" })],
    ["still waiting", orderResult()],
  ])("opens no task for a replaced payment whose order is %s", async (_case, result) => {
    const world = mercadoPagoOrderWorld();
    world.lanes.seed(storedTransaction({ ...WITH_ORDER, replaced: true }));

    await record(world, storedTransaction({ ...WITH_ORDER, replaced: true }), result);

    expect(world.lanes.latePaymentRefunds.size).toBe(0);
  });

  it("decides from the payment as its write left it, so a replacement landing after it was read still opens the task", async () => {
    const world = mercadoPagoOrderWorld();
    world.lanes.seed(storedTransaction(WITH_ORDER));
    const readBeforeTheReplacement = storedTransaction(WITH_ORDER);
    world.lanes.replacementLandsBeforeNextWrite = true;

    await record(world, readBeforeTheReplacement);

    expect(world.lanes.latePaymentRefunds.size).toBe(1);
  });

  it("opens a single task when the same approval is recorded twice", async () => {
    const world = mercadoPagoOrderWorld();
    world.lanes.seed(storedTransaction({ ...WITH_ORDER, replaced: true }));
    const read = storedTransaction({ ...WITH_ORDER, replaced: true });

    await record(world, read);
    await record(world, read);

    expect(world.lanes.latePaymentRefunds.size).toBe(1);
    expect(
      world.lanes.operations.filter((operation) => operation === "openLatePaymentRefund"),
    ).toHaveLength(2);
  });

  it("does not record the approval either when the task cannot be opened", async () => {
    const world = mercadoPagoOrderWorld();
    world.lanes.seed(storedTransaction({ ...WITH_ORDER, replaced: true }));
    world.lanes.failOn = "openLatePaymentRefund";

    await expect(
      record(world, storedTransaction({ ...WITH_ORDER, replaced: true })),
    ).rejects.toThrow("openLatePaymentRefund failed");

    expect(world.lanes.transactions.get(TRANSACTION_ID)?.state).toBe("PENDING");
    expect(world.lanes.resultReadAt.has(TRANSACTION_ID)).toBe(false);
    expect(world.lanes.latePaymentRefunds.size).toBe(0);
  });
});

describe("a payment approved after the register replaced it", () => {
  it("opens one task when Mercado Pago's notification is confirmed twice", async () => {
    const world = mercadoPagoOrderWorld({ reading: { kind: "read", result: paidOrderResult() } });
    world.lanes.seed(storedTransaction({ ...WITH_ORDER, replaced: true }));

    await confirmMercadoPagoOrderNotification(world.notificationPorts, {
      providerOrderId: "order-1",
    });
    await confirmMercadoPagoOrderNotification(world.notificationPorts, {
      providerOrderId: "order-1",
    });

    expect(world.lanes.latePaymentRefunds.size).toBe(1);
  });

  it("opens one task when the cancellation finds the order already paid and the pending check follows", async () => {
    const world = mercadoPagoOrderWorld({ reading: { kind: "read", result: orderResult() } });
    world.mercadoPago.cancellation = { kind: "cannot_cancel" };
    world.mercadoPago.queuedReadings.push({ kind: "read", result: orderResult() });
    world.mercadoPago.queuedReadings.push({ kind: "read", result: paidOrderResult() });
    world.lanes.seed(storedTransaction({ ...WITH_ORDER, replaced: true }));

    const outcome = await cancelMercadoPagoOrder(world.ports, {
      registerId: REGISTER_ID,
      paymentTransactionId: TRANSACTION_ID,
    });
    await checkPendingMercadoPagoPayments(world.notificationPorts);

    expect(outcome.kind).toBe("approved");
    expect(world.lanes.latePaymentRefunds.size).toBe(1);
  });

  it("opens one task when the pending check finds the replaced order paid", async () => {
    const world = mercadoPagoOrderWorld({ reading: { kind: "read", result: paidOrderResult() } });
    world.mercadoPago.cancellation = { kind: "cannot_cancel" };
    world.lanes.seed(storedTransaction({ ...WITH_ORDER, replaced: true }));

    await checkPendingMercadoPagoPayments(world.notificationPorts);
    await checkPendingMercadoPagoPayments(world.notificationPorts);
    expect(
      [...world.lanes.latePaymentRefunds.values()].map(({ refund }) => refund.paymentId),
    ).toEqual([TRANSACTION_ID]);
  });
});
