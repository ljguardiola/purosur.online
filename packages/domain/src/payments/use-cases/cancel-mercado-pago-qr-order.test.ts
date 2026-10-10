import { describe, expect, it } from "vitest";
import { cancelMercadoPagoQrOrder } from "./cancel-mercado-pago-qr-order.js";
import {
  mercadoPagoQrOrderWorld,
  NOW,
  orderResult,
  paidOrderResult,
  REGISTER_ID,
  storedTransaction,
  TRANSACTION_ID,
} from "./test-support/mercado-pago-qr-order-fixtures.js";

const INPUT = { registerId: REGISTER_ID, paymentTransactionId: TRANSACTION_ID };
const WITH_ORDER = { providerOrderId: "order-1" };
const CANCELLED_ORDER = orderResult({ status: "canceled", statusDetail: "canceled" });
const EXPIRED_ORDER = orderResult({ status: "expired", statusDetail: "expired" });
const UNPAID = { kind: "read", result: orderResult() } as const;

describe("cancelMercadoPagoQrOrder", () => {
  it("answers not found for a payment transaction that does not exist", async () => {
    const { mercadoPago, ports } = mercadoPagoQrOrderWorld();

    expect(await cancelMercadoPagoQrOrder(ports, INPUT)).toEqual({ kind: "not_found" });
    expect(mercadoPago.readOrders).toEqual([]);
    expect(mercadoPago.cancellations).toEqual([]);
  });

  it("answers not found for a payment transaction of another register without touching its order", async () => {
    const { lanes, mercadoPago, ports } = mercadoPagoQrOrderWorld();
    lanes.seed(storedTransaction({ ...WITH_ORDER, registerId: "register-2" }));

    expect(await cancelMercadoPagoQrOrder(ports, INPUT)).toEqual({ kind: "not_found" });
    expect(mercadoPago.readOrders).toEqual([]);
    expect(mercadoPago.cancellations).toEqual([]);
    expect(lanes.transactions.get(TRANSACTION_ID)?.state).toBe("PENDING");
  });

  it("reads the order, cancels it keyed by the payment transaction and records it cancelled, all in the payment's lane", async () => {
    const { lanes, mercadoPago, ports } = mercadoPagoQrOrderWorld({ reading: UNPAID });
    mercadoPago.cancellation = { kind: "cancelled", result: CANCELLED_ORDER };
    lanes.seed(storedTransaction(WITH_ORDER));

    const outcome = await cancelMercadoPagoQrOrder(ports, INPUT);

    const expected = storedTransaction({ ...WITH_ORDER, state: "CANCELLED" });
    expect(outcome).toEqual({ kind: "cancelled", transaction: expected });
    expect(lanes.transactions.get(TRANSACTION_ID)).toEqual(expected);
    expect(lanes.resultReadAt.get(TRANSACTION_ID)).toEqual(NOW);
    expect(mercadoPago.cancellations).toEqual([
      { orderId: "order-1", idempotencyKey: TRANSACTION_ID },
    ]);
    expect(mercadoPago.heldLaneDuringCall).toBe(true);
    expect(lanes.lanesEntered).toEqual([TRANSACTION_ID]);
    expect(lanes.operations).toEqual([
      "enterLane",
      "recordedTransaction",
      "readOrder",
      "cancelOrder",
      "recordOrderResult",
      "recordOrderResult",
      "leaveLane",
    ]);
  });

  it("keeps a replaced transaction replaced when it is cancelled", async () => {
    const { lanes, mercadoPago, ports } = mercadoPagoQrOrderWorld({ reading: UNPAID });
    mercadoPago.cancellation = { kind: "cancelled", result: CANCELLED_ORDER };
    lanes.seed(storedTransaction({ ...WITH_ORDER, replaced: true }));

    const outcome = await cancelMercadoPagoQrOrder(ports, INPUT);

    expect(outcome).toMatchObject({ kind: "cancelled", transaction: { replaced: true } });
    expect(lanes.transactions.get(TRANSACTION_ID)?.replaced).toBe(true);
  });

  it("approves instead of cancelling when the order turns out to be paid already", async () => {
    const { lanes, mercadoPago, ports } = mercadoPagoQrOrderWorld({
      reading: { kind: "read", result: paidOrderResult() },
    });
    lanes.seed(storedTransaction(WITH_ORDER));

    const outcome = await cancelMercadoPagoQrOrder(ports, INPUT);

    expect(outcome).toEqual({
      kind: "approved",
      transaction: storedTransaction({ ...WITH_ORDER, state: "APPROVED" }),
    });
    expect(mercadoPago.cancellations).toEqual([]);
  });

  it.each([
    ["declined", "DECLINED"],
    ["cancelled", "CANCELLED"],
    ["expired", "EXPIRED"],
  ] as const)("answers that a %s payment is already closed without calling Mercado Pago", async (_name, state) => {
    const { lanes, mercadoPago, ports } = mercadoPagoQrOrderWorld();
    lanes.seed(storedTransaction({ ...WITH_ORDER, state }));

    const outcome = await cancelMercadoPagoQrOrder(ports, INPUT);

    expect(outcome).toEqual({
      kind: "already_closed",
      transaction: storedTransaction({ ...WITH_ORDER, state }),
    });
    expect(mercadoPago.readOrders).toEqual([]);
    expect(mercadoPago.cancellations).toEqual([]);
  });

  it("approves a payment that was already approved without calling Mercado Pago", async () => {
    const { lanes, mercadoPago, ports } = mercadoPagoQrOrderWorld();
    lanes.seed(storedTransaction({ ...WITH_ORDER, state: "APPROVED" }));

    const outcome = await cancelMercadoPagoQrOrder(ports, INPUT);

    expect(outcome).toEqual({
      kind: "approved",
      transaction: storedTransaction({ ...WITH_ORDER, state: "APPROVED" }),
    });
    expect(mercadoPago.cancellations).toEqual([]);
  });

  it("answers already closed, without cancelling, when reading the order shows it expired", async () => {
    const { lanes, mercadoPago, ports } = mercadoPagoQrOrderWorld({
      reading: { kind: "read", result: EXPIRED_ORDER },
    });
    lanes.seed(storedTransaction(WITH_ORDER));

    const outcome = await cancelMercadoPagoQrOrder(ports, INPUT);

    expect(outcome).toMatchObject({ kind: "already_closed", transaction: { state: "EXPIRED" } });
    expect(lanes.transactions.get(TRANSACTION_ID)?.state).toBe("EXPIRED");
    expect(mercadoPago.cancellations).toEqual([]);
  });

  it("leaves the payment untouched and unavailable when the order cannot be read", async () => {
    const { lanes, mercadoPago, ports } = mercadoPagoQrOrderWorld({
      reading: { kind: "unavailable" },
    });
    lanes.seed(storedTransaction(WITH_ORDER));

    expect(await cancelMercadoPagoQrOrder(ports, INPUT)).toEqual({ kind: "provider_unavailable" });
    expect(mercadoPago.cancellations).toEqual([]);
    expect(lanes.transactions.get(TRANSACTION_ID)).toEqual(storedTransaction(WITH_ORDER));
  });

  it("ends a payment that never got an order once its time is over, without calling Mercado Pago", async () => {
    const { lanes, mercadoPago, ports } = mercadoPagoQrOrderWorld();
    lanes.seed(storedTransaction({ expiresAt: new Date("2026-10-09T11:59:59.000Z") }));

    const outcome = await cancelMercadoPagoQrOrder(ports, INPUT);

    expect(outcome).toMatchObject({ kind: "already_closed", transaction: { state: "EXPIRED" } });
    expect(mercadoPago.cancellations).toEqual([]);
  });

  it("has no order to cancel for a payment whose order may still be created", async () => {
    const { lanes, mercadoPago, ports } = mercadoPagoQrOrderWorld();
    lanes.seed(storedTransaction({ creationOutcomeUnknown: true }));

    expect(await cancelMercadoPagoQrOrder(ports, INPUT)).toEqual({ kind: "provider_unavailable" });
    expect(mercadoPago.cancellations).toEqual([]);
    expect(lanes.transactions.get(TRANSACTION_ID)).toEqual(
      storedTransaction({ creationOutcomeUnknown: true }),
    );
  });

  it("leaves the payment pending and unavailable when Mercado Pago cannot be reached to cancel", async () => {
    const { lanes, mercadoPago, ports } = mercadoPagoQrOrderWorld({ reading: UNPAID });
    mercadoPago.cancellation = { kind: "unavailable" };
    lanes.seed(storedTransaction(WITH_ORDER));

    expect(await cancelMercadoPagoQrOrder(ports, INPUT)).toEqual({ kind: "provider_unavailable" });
    expect(lanes.transactions.get(TRANSACTION_ID)).toEqual(storedTransaction(WITH_ORDER));
  });

  it("records the order cancelled and answers already closed when Mercado Pago says it was already cancelled", async () => {
    const { lanes, mercadoPago, ports } = mercadoPagoQrOrderWorld({ reading: UNPAID });
    mercadoPago.cancellation = { kind: "already_cancelled" };
    lanes.seed(storedTransaction(WITH_ORDER));

    const outcome = await cancelMercadoPagoQrOrder(ports, INPUT);

    const expected = storedTransaction({ ...WITH_ORDER, state: "CANCELLED" });
    expect(outcome).toEqual({ kind: "already_closed", transaction: expected });
    expect(lanes.transactions.get(TRANSACTION_ID)).toEqual(expected);
    expect(lanes.resultReadAt.get(TRANSACTION_ID)).toEqual(NOW);
  });

  describe("when Mercado Pago says the order cannot be cancelled", () => {
    it("approves the payment when the order was paid in the meantime", async () => {
      const { lanes, mercadoPago, ports } = mercadoPagoQrOrderWorld();
      mercadoPago.queuedReadings.push(UNPAID, { kind: "read", result: paidOrderResult() });
      mercadoPago.cancellation = { kind: "cannot_cancel" };
      lanes.seed(storedTransaction({ ...WITH_ORDER, replaced: true }));

      const outcome = await cancelMercadoPagoQrOrder(ports, INPUT);

      const expected = storedTransaction({ ...WITH_ORDER, state: "APPROVED", replaced: true });
      expect(outcome).toEqual({ kind: "approved", transaction: expected });
      expect(lanes.transactions.get(TRANSACTION_ID)).toEqual(expected);
      expect(mercadoPago.readOrders).toEqual(["order-1", "order-1"]);
    });

    it("answers already closed when the order expired", async () => {
      const { lanes, mercadoPago, ports } = mercadoPagoQrOrderWorld();
      mercadoPago.queuedReadings.push(UNPAID, { kind: "read", result: EXPIRED_ORDER });
      mercadoPago.cancellation = { kind: "cannot_cancel" };
      lanes.seed(storedTransaction(WITH_ORDER));

      const outcome = await cancelMercadoPagoQrOrder(ports, INPUT);

      expect(outcome).toMatchObject({ kind: "already_closed", transaction: { state: "EXPIRED" } });
      expect(lanes.transactions.get(TRANSACTION_ID)?.state).toBe("EXPIRED");
    });

    it("answers already closed when the order was cancelled by someone else", async () => {
      const { lanes, mercadoPago, ports } = mercadoPagoQrOrderWorld();
      mercadoPago.queuedReadings.push(UNPAID, { kind: "read", result: CANCELLED_ORDER });
      mercadoPago.cancellation = { kind: "cannot_cancel" };
      lanes.seed(storedTransaction(WITH_ORDER));

      const outcome = await cancelMercadoPagoQrOrder(ports, INPUT);

      expect(outcome).toMatchObject({ kind: "already_closed", transaction: { state: "CANCELLED" } });
    });

    it("is unavailable and leaves the payment untouched when the order cannot be read again", async () => {
      const { lanes, mercadoPago, ports } = mercadoPagoQrOrderWorld();
      mercadoPago.queuedReadings.push(UNPAID, { kind: "unavailable" });
      mercadoPago.cancellation = { kind: "cannot_cancel" };
      lanes.seed(storedTransaction(WITH_ORDER));

      expect(await cancelMercadoPagoQrOrder(ports, INPUT)).toEqual({
        kind: "provider_unavailable",
      });
      expect(lanes.transactions.get(TRANSACTION_ID)).toEqual(storedTransaction(WITH_ORDER));
    });

    it("is unavailable when the order is still open, so the cancellation is retried", async () => {
      const { lanes, mercadoPago, ports } = mercadoPagoQrOrderWorld({ reading: UNPAID });
      mercadoPago.cancellation = { kind: "cannot_cancel" };
      lanes.seed(storedTransaction(WITH_ORDER));

      expect(await cancelMercadoPagoQrOrder(ports, INPUT)).toEqual({
        kind: "provider_unavailable",
      });
      expect(lanes.transactions.get(TRANSACTION_ID)?.state).toBe("PENDING");
    });
  });

  describe("when the cancellation answers an order that is not cancelled", () => {
    it("approves the payment when the answered order is paid", async () => {
      const { lanes, mercadoPago, ports } = mercadoPagoQrOrderWorld({ reading: UNPAID });
      mercadoPago.cancellation = { kind: "cancelled", result: paidOrderResult() };
      lanes.seed(storedTransaction(WITH_ORDER));

      expect(await cancelMercadoPagoQrOrder(ports, INPUT)).toMatchObject({
        kind: "approved",
        transaction: { state: "APPROVED" },
      });
    });

    it("is unavailable when the answered order is still open", async () => {
      const { lanes, mercadoPago, ports } = mercadoPagoQrOrderWorld({ reading: UNPAID });
      mercadoPago.cancellation = { kind: "cancelled", result: orderResult() };
      lanes.seed(storedTransaction(WITH_ORDER));

      expect(await cancelMercadoPagoQrOrder(ports, INPUT)).toEqual({
        kind: "provider_unavailable",
      });
    });
  });
});
