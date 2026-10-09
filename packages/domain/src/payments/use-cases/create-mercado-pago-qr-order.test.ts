import { describe, expect, it } from "vitest";
import { createMercadoPagoQrOrder } from "./create-mercado-pago-qr-order.js";
import {
  AMOUNT,
  mercadoPagoQrOrderWorld,
  NOW,
  orderResult,
  paidOrderResult,
  REGISTER_ID,
  SALE_ID,
  storedTransaction,
  TRANSACTION_ID,
} from "./test-support/mercado-pago-qr-order-fixtures.js";

const INPUT = {
  registerId: REGISTER_ID,
  paymentTransactionId: TRANSACTION_ID,
  saleId: SALE_ID,
  amount: AMOUNT,
};

describe("createMercadoPagoQrOrder", () => {
  it("records the pending payment before calling Mercado Pago, holding the transaction's lane the whole time", async () => {
    const { lanes, mercadoPago, ports } = mercadoPagoQrOrderWorld();

    await createMercadoPagoQrOrder(ports, INPUT);

    expect(lanes.operations).toEqual([
      "enterLane",
      "recordedTransaction",
      "recordPendingTransaction",
      "createQrOrder",
      "recordOrderCreated",
      "recordOrderResult",
      "leaveLane",
    ]);
    expect(lanes.lanesEntered).toEqual([TRANSACTION_ID]);
    expect(mercadoPago.heldLaneDuringCall).toBe(true);
    expect(mercadoPago.transactionsRecordedDuringCall).toEqual([TRANSACTION_ID]);
  });

  it("creates the order for the exact amount, identified by the payment transaction, expiring in 5 minutes", async () => {
    const { mercadoPago, ports } = mercadoPagoQrOrderWorld();

    await createMercadoPagoQrOrder(ports, INPUT);

    expect(mercadoPago.creationRequests).toEqual([
      {
        idempotencyKey: TRANSACTION_ID,
        externalReference: TRANSACTION_ID,
        amount: AMOUNT,
        expiresAfterMinutes: 5,
      },
    ]);
  });

  it("reports a new order as a pending payment that expires 5 minutes after it was created", async () => {
    const { lanes, ports } = mercadoPagoQrOrderWorld();

    const outcome = await createMercadoPagoQrOrder(ports, INPUT);

    const expected = storedTransaction({
      providerOrderId: "order-1",
      createdAt: NOW,
      expiresAt: new Date("2026-10-09T12:05:00.000Z"),
    });
    expect(outcome).toEqual({ kind: "recorded", transaction: expected });
    expect(lanes.transactions.get(TRANSACTION_ID)).toEqual(expected);
    expect(lanes.resultReadAt.get(TRANSACTION_ID)).toEqual(NOW);
  });

  it("trusts the answer of a new order's creation", async () => {
    const { ports } = mercadoPagoQrOrderWorld({
      creation: { kind: "created", orderId: "order-1", result: paidOrderResult() },
    });

    const outcome = await createMercadoPagoQrOrder(ports, INPUT);

    expect(outcome).toMatchObject({ kind: "recorded", transaction: { state: "APPROVED" } });
  });

  it.each([0, -100, 12.5])("refuses the amount %s without recording anything", async (amount) => {
    const { lanes, mercadoPago, ports } = mercadoPagoQrOrderWorld();

    const outcome = await createMercadoPagoQrOrder(ports, { ...INPUT, amount });

    expect(outcome).toEqual({ kind: "invalid_amount" });
    expect(lanes.operations).toEqual([]);
    expect(mercadoPago.creationRequests).toEqual([]);
  });

  it("answers not owned, without calling Mercado Pago, when the payment transaction belongs to another register", async () => {
    const { lanes, mercadoPago, ports } = mercadoPagoQrOrderWorld();
    lanes.seed(storedTransaction({ registerId: "register-2" }));

    const outcome = await createMercadoPagoQrOrder(ports, INPUT);

    expect(outcome).toEqual({ kind: "not_owned" });
    expect(mercadoPago.creationRequests).toEqual([]);
    expect(lanes.transactions.get(TRANSACTION_ID)?.registerId).toBe("register-2");
  });

  it("answers a request that differs from the recorded one as a mismatch without calling Mercado Pago", async () => {
    const { lanes, mercadoPago, ports } = mercadoPagoQrOrderWorld();
    lanes.seed(storedTransaction());

    const otherSale = await createMercadoPagoQrOrder(ports, { ...INPUT, saleId: "sale-2" });
    const otherAmount = await createMercadoPagoQrOrder(ports, { ...INPUT, amount: AMOUNT + 1 });

    expect(otherSale).toEqual({ kind: "request_mismatch" });
    expect(otherAmount).toEqual({ kind: "request_mismatch" });
    expect(mercadoPago.creationRequests).toEqual([]);
    expect(mercadoPago.readOrders).toEqual([]);
  });

  it("keeps the payment pending and records no order when Mercado Pago refuses the order", async () => {
    const { lanes, ports } = mercadoPagoQrOrderWorld({
      creation: { kind: "refused", code: "invalid_qr" },
    });

    const outcome = await createMercadoPagoQrOrder(ports, INPUT);

    expect(outcome).toEqual({ kind: "provider_refused" });
    expect(lanes.transactions.get(TRANSACTION_ID)).toMatchObject({
      state: "PENDING",
      providerOrderId: null,
    });
  });

  it("keeps the payment pending when Mercado Pago cannot be reached", async () => {
    const { lanes, ports } = mercadoPagoQrOrderWorld({ creation: { kind: "unavailable" } });

    const outcome = await createMercadoPagoQrOrder(ports, INPUT);

    expect(outcome).toEqual({ kind: "provider_unavailable" });
    expect(lanes.transactions.get(TRANSACTION_ID)).toMatchObject({
      state: "PENDING",
      providerOrderId: null,
    });
  });

  describe("asking again after the payment was recorded without an order", () => {
    it("sends exactly the same request", async () => {
      const first = mercadoPagoQrOrderWorld({ creation: { kind: "unavailable" } });
      await createMercadoPagoQrOrder(first.ports, INPUT);
      const second = mercadoPagoQrOrderWorld();
      second.lanes.seed(first.lanes.transactions.get(TRANSACTION_ID) ?? storedTransaction());

      await createMercadoPagoQrOrder(second.ports, INPUT);

      expect(second.mercadoPago.creationRequests).toEqual(first.mercadoPago.creationRequests);
    });

    it("reads the order after creating it instead of trusting the creation answer", async () => {
      const { lanes, mercadoPago, ports } = mercadoPagoQrOrderWorld({
        creation: { kind: "created", orderId: "order-1", result: paidOrderResult() },
        reading: { kind: "read", result: orderResult({ status: "canceled" }) },
      });
      lanes.seed(storedTransaction());

      const outcome = await createMercadoPagoQrOrder(ports, INPUT);

      expect(lanes.operations).toEqual([
        "enterLane",
        "recordedTransaction",
        "createQrOrder",
        "recordOrderCreated",
        "readOrder",
        "recordOrderResult",
        "leaveLane",
      ]);
      expect(mercadoPago.readOrders).toEqual(["order-1"]);
      expect(outcome).toMatchObject({ kind: "recorded", transaction: { state: "CANCELLED" } });
    });

    it("keeps the created order when it cannot be read, so the next ask only reads", async () => {
      const { lanes, mercadoPago, ports } = mercadoPagoQrOrderWorld({
        reading: { kind: "unavailable" },
      });
      lanes.seed(storedTransaction());

      const outcome = await createMercadoPagoQrOrder(ports, INPUT);
      mercadoPago.reading = { kind: "read", result: orderResult() };
      await createMercadoPagoQrOrder(ports, INPUT);

      expect(outcome).toEqual({ kind: "provider_unavailable" });
      expect(mercadoPago.creationRequests).toHaveLength(1);
      expect(mercadoPago.readOrders).toEqual(["order-1", "order-1"]);
    });
  });

  describe("asking again after the order was created", () => {
    it("never creates a second order and reports the state of the existing one", async () => {
      const { lanes, mercadoPago, ports } = mercadoPagoQrOrderWorld({
        reading: { kind: "read", result: paidOrderResult() },
      });
      lanes.seed(storedTransaction({ providerOrderId: "order-1" }));

      const outcome = await createMercadoPagoQrOrder(ports, INPUT);

      expect(mercadoPago.creationRequests).toEqual([]);
      expect(mercadoPago.readOrders).toEqual(["order-1"]);
      expect(outcome).toMatchObject({
        kind: "recorded",
        transaction: { state: "APPROVED", providerOrderId: "order-1" },
      });
    });

    it("answers a payment already final as it is, without calling Mercado Pago", async () => {
      const { lanes, mercadoPago, ports } = mercadoPagoQrOrderWorld();
      lanes.seed(storedTransaction({ providerOrderId: "order-1", state: "DECLINED" }));

      const outcome = await createMercadoPagoQrOrder(ports, INPUT);

      expect(outcome).toMatchObject({ kind: "recorded", transaction: { state: "DECLINED" } });
      expect(mercadoPago.readOrders).toEqual([]);
      expect(lanes.operations).not.toContain("recordOrderResult");
    });

    it("answers provider unavailable when the order cannot be read", async () => {
      const { lanes, ports } = mercadoPagoQrOrderWorld({ reading: { kind: "unavailable" } });
      lanes.seed(storedTransaction({ providerOrderId: "order-1" }));

      expect(await createMercadoPagoQrOrder(ports, INPUT)).toEqual({
        kind: "provider_unavailable",
      });
    });
  });

  it("answers not owned when another request recorded the payment first", async () => {
    const { lanes, mercadoPago, ports } = mercadoPagoQrOrderWorld();
    lanes.racer = storedTransaction({ registerId: "register-2" });

    const outcome = await createMercadoPagoQrOrder(ports, INPUT);

    expect(outcome).toEqual({ kind: "not_owned" });
    expect(mercadoPago.creationRequests).toEqual([]);
  });

  it("leaves no result when recording it fails, and the next ask only reads the order already created", async () => {
    const { lanes, mercadoPago, ports } = mercadoPagoQrOrderWorld();
    lanes.failOn = "recordOrderResult";

    await expect(createMercadoPagoQrOrder(ports, INPUT)).rejects.toThrow(
      "recordOrderResult failed",
    );
    expect(lanes.resultReadAt.size).toBe(0);
    expect(lanes.transactions.get(TRANSACTION_ID)).toMatchObject({
      state: "PENDING",
      providerOrderId: "order-1",
    });

    lanes.failOn = undefined;
    await createMercadoPagoQrOrder(ports, INPUT);

    expect(mercadoPago.creationRequests).toHaveLength(1);
    expect(mercadoPago.readOrders).toEqual(["order-1"]);
  });

  it("leaves nothing recorded when recording the pending payment fails", async () => {
    const { lanes, mercadoPago, ports } = mercadoPagoQrOrderWorld();
    lanes.failOn = "recordPendingTransaction";

    await expect(createMercadoPagoQrOrder(ports, INPUT)).rejects.toThrow(
      "recordPendingTransaction failed",
    );

    expect(lanes.transactions.size).toBe(0);
    expect(mercadoPago.creationRequests).toEqual([]);
  });
});
