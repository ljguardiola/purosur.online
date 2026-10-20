import { describe, expect, it } from "vitest";
import { checkPendingMercadoPagoPayments } from "./check-pending-mercado-pago-payments.js";
import {
  AMOUNT,
  mercadoPagoOrderWorld,
  NOW,
  orderResult,
  paidOrderResult,
  storedPointTransaction,
  storedTransaction,
  TRANSACTION_ID,
} from "./test-support/mercado-pago-order-fixtures.js";

const AWAITING_ORDER = { creationOutcomeUnknown: true };
const HOUR_MS = 60 * 60 * 1000;

function found(...orders: [string, ReturnType<typeof orderResult>][]) {
  return {
    kind: "read",
    orders: orders.map(([orderId, result]) => ({
      orderId,
      result: { ...result, externalReference: TRANSACTION_ID },
    })),
  } as const;
}

describe("checkPendingMercadoPagoPayments of a payment whose order creation was unclear", () => {
  it("searches Mercado Pago for the order by the payment's id within the payment's time and records it", async () => {
    const { lanes, mercadoPago, notificationPorts } = mercadoPagoOrderWorld();
    mercadoPago.searching = found(["order-7", paidOrderResult()]);
    lanes.seed(storedTransaction(AWAITING_ORDER));

    const outcome = await checkPendingMercadoPagoPayments(notificationPorts);

    expect(outcome).toEqual({ kind: "checked", refreshed: 1, unavailable: 0 });
    expect(mercadoPago.orderSearches).toEqual([
      {
        externalReference: TRANSACTION_ID,
        createdFrom: new Date("2026-10-09T11:59:00.000Z"),
        createdTo: new Date("2026-10-09T12:04:00.000Z"),
      },
    ]);
    expect(mercadoPago.heldLaneDuringCall).toBe(true);
    expect(lanes.transactions.get(TRANSACTION_ID)).toMatchObject({
      providerOrderId: "order-7",
      state: "APPROVED",
      creationOutcomeUnknown: true,
    });
    expect(lanes.latePaymentRefunds.size).toBe(0);
  });

  it("records the order and keeps the payment pending when the order is not paid yet", async () => {
    const { lanes, mercadoPago, notificationPorts } = mercadoPagoOrderWorld();
    mercadoPago.searching = found(["order-7", orderResult()]);
    lanes.seed(storedTransaction(AWAITING_ORDER));

    await checkPendingMercadoPagoPayments(notificationPorts);

    expect(lanes.transactions.get(TRANSACTION_ID)).toMatchObject({
      providerOrderId: "order-7",
      state: "PENDING",
      needsReview: false,
    });
  });

  it("searches before deciding the payment's time is over", async () => {
    const { lanes, mercadoPago, notificationPorts } = mercadoPagoOrderWorld();
    mercadoPago.searching = found(["order-7", paidOrderResult()]);
    lanes.seed(
      storedTransaction({ ...AWAITING_ORDER, expiresAt: new Date("2026-10-09T11:59:59.000Z") }),
    );

    await checkPendingMercadoPagoPayments(notificationPorts);

    expect(lanes.transactions.get(TRANSACTION_ID)).toMatchObject({
      providerOrderId: "order-7",
      state: "APPROVED",
      needsReview: false,
    });
  });

  it("keeps searching a payment already marked as needing review, which stays pending without an order", async () => {
    const { lanes, mercadoPago, notificationPorts } = mercadoPagoOrderWorld();
    lanes.seed(
      storedTransaction({
        ...AWAITING_ORDER,
        needsReview: true,
        expiresAt: new Date("2026-10-09T11:59:59.000Z"),
      }),
    );

    await checkPendingMercadoPagoPayments(notificationPorts);
    expect(lanes.transactions.get(TRANSACTION_ID)).toMatchObject({
      providerOrderId: null,
      state: "PENDING",
      needsReview: true,
    });
    mercadoPago.searching = found(["order-7", paidOrderResult()]);
    await checkPendingMercadoPagoPayments(notificationPorts);

    expect(mercadoPago.orderSearches).toHaveLength(2);
    expect(lanes.transactions.get(TRANSACTION_ID)).toMatchObject({
      providerOrderId: "order-7",
      state: "APPROVED",
    });
  });

  it("marks the payment as needing review once its time is over and Mercado Pago has no order for it", async () => {
    const { lanes, notificationPorts } = mercadoPagoOrderWorld();
    lanes.seed(
      storedTransaction({ ...AWAITING_ORDER, expiresAt: new Date("2026-10-09T11:59:59.000Z") }),
    );

    const outcome = await checkPendingMercadoPagoPayments(notificationPorts);

    expect(outcome).toEqual({ kind: "checked", refreshed: 1, unavailable: 0 });
    expect(lanes.transactions.get(TRANSACTION_ID)).toMatchObject({
      providerOrderId: null,
      state: "PENDING",
      needsReview: true,
    });
  });

  it("leaves the payment pending, without an order, while its time is not over and Mercado Pago has no order for it", async () => {
    const { lanes, notificationPorts } = mercadoPagoOrderWorld();
    lanes.seed(storedTransaction(AWAITING_ORDER));

    await checkPendingMercadoPagoPayments(notificationPorts);

    expect(lanes.transactions.get(TRANSACTION_ID)).toEqual(storedTransaction(AWAITING_ORDER));
  });

  it("counts the payment unavailable and records nothing when Mercado Pago cannot be searched", async () => {
    const { lanes, mercadoPago, notificationPorts } = mercadoPagoOrderWorld();
    mercadoPago.searching = { kind: "unavailable" };
    const expired = storedTransaction({
      ...AWAITING_ORDER,
      expiresAt: new Date("2026-10-09T11:59:59.000Z"),
    });
    lanes.seed(expired);

    const outcome = await checkPendingMercadoPagoPayments(notificationPorts);

    expect(outcome).toEqual({ kind: "checked", refreshed: 0, unavailable: 1 });
    expect(lanes.transactions.get(TRANSACTION_ID)).toEqual(expired);
  });

  it("searches a Point payment the same way", async () => {
    const { lanes, mercadoPago, notificationPorts } = mercadoPagoOrderWorld();
    mercadoPago.searching = found(["order-7", paidOrderResult()]);
    lanes.seed(storedPointTransaction(AWAITING_ORDER));

    await checkPendingMercadoPagoPayments(notificationPorts);

    expect(lanes.transactions.get(TRANSACTION_ID)).toMatchObject({
      providerOrderId: "order-7",
      state: "APPROVED",
    });
  });

  it("opens the late payment refund task when the payment was replaced and the found order is paid", async () => {
    const { lanes, mercadoPago, notificationPorts } = mercadoPagoOrderWorld();
    mercadoPago.searching = found(["order-7", paidOrderResult()]);
    lanes.seed(storedTransaction({ ...AWAITING_ORDER, replaced: true }));

    await checkPendingMercadoPagoPayments(notificationPorts);

    expect([...lanes.latePaymentRefunds.values()].map(({ refund }) => refund.paymentId)).toEqual([
      TRANSACTION_ID,
    ]);
    expect(lanes.transactions.get(TRANSACTION_ID)?.providerOrderId).toBe("order-7");
  });

  describe("when Mercado Pago has several orders for the payment", () => {
    function refundedOrders(lanes: { latePaymentRefunds: Map<string, unknown> }) {
      return [...lanes.latePaymentRefunds.values()].map((opened) => {
        const { refund } = opened as { refund: { providerOrderId: string | null; amount: number } };
        return [refund.providerOrderId, refund.amount];
      });
    }

    it("records the paid one and opens a refund task for each other paid one", async () => {
      const { lanes, mercadoPago, notificationPorts } = mercadoPagoOrderWorld();
      mercadoPago.searching = found(
        ["order-1", orderResult()],
        ["order-2", paidOrderResult()],
        ["order-3", paidOrderResult(AMOUNT + 500)],
        ["order-4", orderResult()],
      );
      lanes.seed(storedTransaction(AWAITING_ORDER));

      await checkPendingMercadoPagoPayments(notificationPorts);

      expect(lanes.transactions.get(TRANSACTION_ID)).toMatchObject({
        providerOrderId: "order-2",
        state: "APPROVED",
      });
      expect(refundedOrders(lanes)).toEqual([["order-3", AMOUNT + 500]]);
    });

    it("records the first when none is paid and opens no refund task", async () => {
      const { lanes, mercadoPago, notificationPorts } = mercadoPagoOrderWorld();
      mercadoPago.searching = found(["order-1", orderResult()], ["order-2", orderResult()]);
      lanes.seed(storedTransaction(AWAITING_ORDER));

      await checkPendingMercadoPagoPayments(notificationPorts);

      expect(lanes.transactions.get(TRANSACTION_ID)).toMatchObject({
        providerOrderId: "order-1",
        state: "PENDING",
      });
      expect(lanes.latePaymentRefunds.size).toBe(0);
    });

    it("records the order and opens the refund tasks in one storage transaction", async () => {
      const { lanes, mercadoPago, notificationPorts } = mercadoPagoOrderWorld();
      mercadoPago.searching = found(["order-1", paidOrderResult()], ["order-2", paidOrderResult()]);
      lanes.failOn = "openLatePaymentRefund";
      lanes.seed(storedTransaction(AWAITING_ORDER));

      await expect(checkPendingMercadoPagoPayments(notificationPorts)).rejects.toThrow();

      expect(lanes.transactions.get(TRANSACTION_ID)).toEqual(storedTransaction(AWAITING_ORDER));
      expect(lanes.latePaymentRefunds.size).toBe(0);
    });
  });

  describe("searches only while it can still find a paid order", () => {
    const createdAt = new Date(NOW.getTime() - 72 * HOUR_MS);

    it("still searches a payment created exactly 72 hours ago", async () => {
      const { lanes, mercadoPago, notificationPorts } = mercadoPagoOrderWorld();
      lanes.seed(storedTransaction({ ...AWAITING_ORDER, createdAt }));

      await checkPendingMercadoPagoPayments(notificationPorts);

      expect(mercadoPago.orderSearches).toHaveLength(1);
    });

    it("no longer searches a payment created a millisecond earlier, and ends its time as usual", async () => {
      const { lanes, mercadoPago, notificationPorts } = mercadoPagoOrderWorld();
      lanes.seed(
        storedTransaction({
          ...AWAITING_ORDER,
          createdAt: new Date(createdAt.getTime() - 1),
          expiresAt: new Date(NOW.getTime() - 71 * HOUR_MS),
        }),
      );

      await checkPendingMercadoPagoPayments(notificationPorts);

      expect(mercadoPago.orderSearches).toEqual([]);
      expect(lanes.transactions.get(TRANSACTION_ID)).toMatchObject({ needsReview: true });
    });
  });

  describe("never searches", () => {
    it("a payment that has its order", async () => {
      const { lanes, mercadoPago, notificationPorts } = mercadoPagoOrderWorld();
      lanes.seed(storedTransaction({ ...AWAITING_ORDER, providerOrderId: "order-1" }));

      await checkPendingMercadoPagoPayments(notificationPorts);

      expect(mercadoPago.orderSearches).toEqual([]);
    });

    it("a payment whose order creation was answered clearly", async () => {
      const { lanes, mercadoPago, notificationPorts } = mercadoPagoOrderWorld();
      lanes.seed(storedTransaction());

      await checkPendingMercadoPagoPayments(notificationPorts);

      expect(mercadoPago.orderSearches).toEqual([]);
    });

    it("a payment that is no longer pending", async () => {
      const { lanes, directory, mercadoPago, notificationPorts } = mercadoPagoOrderWorld();
      lanes.seed(storedTransaction({ ...AWAITING_ORDER, needsReview: true, state: "EXPIRED" }));
      directory.staleListing = [{ id: TRANSACTION_ID, registerId: "register-1" }];

      await checkPendingMercadoPagoPayments(notificationPorts);

      expect(mercadoPago.orderSearches).toEqual([]);
    });
  });
});
