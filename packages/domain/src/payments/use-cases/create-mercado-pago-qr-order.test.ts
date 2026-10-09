import { describe, expect, it } from "vitest";
import { createMercadoPagoQrOrder } from "./create-mercado-pago-qr-order.js";
import type { FakePaymentTransactionLanes } from "./test-support/fake-payment-transaction-lanes.js";
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

async function askAgainAtExpiry(lanes: FakePaymentTransactionLanes) {
  const recorded = lanes.transactions.get(TRANSACTION_ID) ?? storedTransaction();
  const later = mercadoPagoQrOrderWorld({}, recorded.expiresAt);
  later.lanes.seed(recorded);
  const outcome = await createMercadoPagoQrOrder(later.ports, INPUT);
  return { later, outcome };
}

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

  it("reports a new order as a pending payment that expires 5 minutes after it was asked for, plus the longest the creation call can take", async () => {
    const { lanes, ports } = mercadoPagoQrOrderWorld();

    const outcome = await createMercadoPagoQrOrder(ports, INPUT);

    const expected = storedTransaction({
      providerOrderId: "order-1",
      creationOutcomeUnknown: true,
      createdAt: NOW,
      expiresAt: new Date("2026-10-09T12:05:10.000Z"),
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
    const { lanes, ports } = mercadoPagoQrOrderWorld({ creation: { kind: "refused" } });

    const outcome = await createMercadoPagoQrOrder(ports, INPUT);

    expect(outcome).toEqual({ kind: "provider_refused" });
    expect(lanes.transactions.get(TRANSACTION_ID)).toMatchObject({
      state: "PENDING",
      needsReview: false,
      providerOrderId: null,
      creationOutcomeUnknown: false,
    });
  });

  it("records, before calling Mercado Pago, that the first attempt may create an order", async () => {
    const { mercadoPago, ports } = mercadoPagoQrOrderWorld();

    await createMercadoPagoQrOrder(ports, INPUT);

    expect(mercadoPago.recordedDuringCreation?.creationOutcomeUnknown).toBe(true);
  });

  it("keeps the payment pending, still remembering that the order may exist, when Mercado Pago's answer to the creation is unknown", async () => {
    const { lanes, ports } = mercadoPagoQrOrderWorld({ creation: { kind: "unavailable" } });

    const outcome = await createMercadoPagoQrOrder(ports, INPUT);

    expect(outcome).toEqual({ kind: "provider_unavailable" });
    expect(lanes.operations).toEqual([
      "enterLane",
      "recordedTransaction",
      "recordPendingTransaction",
      "createQrOrder",
      "leaveLane",
    ]);
    expect(lanes.transactions.get(TRANSACTION_ID)).toMatchObject({
      state: "PENDING",
      needsReview: false,
      providerOrderId: null,
      creationOutcomeUnknown: true,
    });
  });

  it("keeps the payment pending, with no order possibly created, when Mercado Pago asks to try again later", async () => {
    const { lanes, ports } = mercadoPagoQrOrderWorld({ creation: { kind: "throttled" } });

    const outcome = await createMercadoPagoQrOrder(ports, INPUT);

    expect(outcome).toEqual({ kind: "provider_unavailable" });
    expect(lanes.transactions.get(TRANSACTION_ID)).toMatchObject({
      state: "PENDING",
      needsReview: false,
      providerOrderId: null,
      creationOutcomeUnknown: false,
    });
  });

  it("ends a payment whose order Mercado Pago asked to try again later as expired once its expiry is reached, without calling Mercado Pago", async () => {
    const { lanes, ports } = mercadoPagoQrOrderWorld({ creation: { kind: "throttled" } });
    await createMercadoPagoQrOrder(ports, INPUT);

    const { later, outcome } = await askAgainAtExpiry(lanes);

    expect(outcome).toMatchObject({
      kind: "recorded",
      transaction: { state: "EXPIRED", needsReview: false },
    });
    expect(later.mercadoPago.creationRequests).toEqual([]);
  });

  describe("when the answer to the creation is never recorded", () => {
    it("keeps the payment pending for a person to review once its expiry is reached when recording the created order fails", async () => {
      const { lanes, ports } = mercadoPagoQrOrderWorld();
      lanes.failOn = "recordOrderCreated";
      await expect(createMercadoPagoQrOrder(ports, INPUT)).rejects.toThrow(
        "recordOrderCreated failed",
      );

      const { later, outcome } = await askAgainAtExpiry(lanes);

      expect(outcome).toMatchObject({
        kind: "recorded",
        transaction: { state: "PENDING", needsReview: true, providerOrderId: null },
      });
      expect(later.mercadoPago.creationRequests).toEqual([]);
      expect(later.mercadoPago.readOrders).toEqual([]);
    });

    it("keeps the payment pending for a person to review once its expiry is reached when the creation call stops midway", async () => {
      const { lanes, mercadoPago, ports } = mercadoPagoQrOrderWorld();
      mercadoPago.creationStopsMidway = true;
      await expect(createMercadoPagoQrOrder(ports, INPUT)).rejects.toThrow(
        "createQrOrder stopped midway",
      );

      const { later, outcome } = await askAgainAtExpiry(lanes);

      expect(outcome).toMatchObject({
        kind: "recorded",
        transaction: { state: "PENDING", needsReview: true, providerOrderId: null },
      });
      expect(later.mercadoPago.creationRequests).toEqual([]);
      expect(later.mercadoPago.readOrders).toEqual([]);
    });

    it("keeps a retry's payment pending for a person to review once its expiry is reached when the retry's call stops midway", async () => {
      const { lanes, mercadoPago, ports } = mercadoPagoQrOrderWorld();
      lanes.seed(storedTransaction());
      mercadoPago.creationStopsMidway = true;
      await expect(createMercadoPagoQrOrder(ports, INPUT)).rejects.toThrow(
        "createQrOrder stopped midway",
      );

      const { later, outcome } = await askAgainAtExpiry(lanes);

      expect(outcome).toMatchObject({
        kind: "recorded",
        transaction: { state: "PENDING", needsReview: true },
      });
      expect(later.mercadoPago.creationRequests).toEqual([]);
    });
  });

  describe("asking again after the payment was recorded without an order", () => {
    it("records, before calling Mercado Pago, that the retry may create an order", async () => {
      const { lanes, mercadoPago, ports } = mercadoPagoQrOrderWorld();
      lanes.seed(storedTransaction());

      await createMercadoPagoQrOrder(ports, INPUT);

      expect(mercadoPago.recordedDuringCreation?.creationOutcomeUnknown).toBe(true);
    });

    it("records that a refused retry created nothing when no earlier attempt may have created an order", async () => {
      const { lanes, ports } = mercadoPagoQrOrderWorld({ creation: { kind: "refused" } });
      lanes.seed(storedTransaction());

      await createMercadoPagoQrOrder(ports, INPUT);

      expect(lanes.transactions.get(TRANSACTION_ID)?.creationOutcomeUnknown).toBe(false);
    });

    it("sends exactly the same request", async () => {
      const first = mercadoPagoQrOrderWorld({ creation: { kind: "unavailable" } });
      await createMercadoPagoQrOrder(first.ports, INPUT);
      const second = mercadoPagoQrOrderWorld();
      second.lanes.seed(first.lanes.transactions.get(TRANSACTION_ID) ?? storedTransaction());

      await createMercadoPagoQrOrder(second.ports, INPUT);

      expect(second.mercadoPago.creationRequests).toEqual(first.mercadoPago.creationRequests);
    });

    it("records the new attempt's expiry, 5 minutes plus the longest call after it starts, before calling Mercado Pago", async () => {
      const { lanes, ports } = mercadoPagoQrOrderWorld();
      lanes.seed(storedTransaction());

      const outcome = await createMercadoPagoQrOrder(ports, INPUT);

      const expiresAt = new Date("2026-10-09T12:05:10.000Z");
      expect(lanes.operations.slice(0, 4)).toEqual([
        "enterLane",
        "recordedTransaction",
        "recordCreationAttempt",
        "createQrOrder",
      ]);
      expect(outcome).toMatchObject({
        kind: "recorded",
        transaction: { createdAt: new Date("2026-10-09T11:59:00.000Z"), expiresAt },
      });
      expect(lanes.transactions.get(TRANSACTION_ID)?.expiresAt).toEqual(expiresAt);
    });

    it("keeps the new attempt's expiry when Mercado Pago cannot be reached", async () => {
      const { lanes, ports } = mercadoPagoQrOrderWorld({ creation: { kind: "unavailable" } });
      lanes.seed(storedTransaction());

      await createMercadoPagoQrOrder(ports, INPUT);

      expect(lanes.transactions.get(TRANSACTION_ID)?.expiresAt).toEqual(
        new Date("2026-10-09T12:05:10.000Z"),
      );
    });

    it("ends the payment as expired, without calling Mercado Pago, once its expiry is reached", async () => {
      const { lanes, mercadoPago, ports } = mercadoPagoQrOrderWorld();
      lanes.seed(storedTransaction({ expiresAt: NOW }));

      const outcome = await createMercadoPagoQrOrder(ports, INPUT);

      expect(outcome).toEqual({
        kind: "recorded",
        transaction: storedTransaction({ expiresAt: NOW, state: "EXPIRED" }),
      });
      expect(lanes.transactions.get(TRANSACTION_ID)?.state).toBe("EXPIRED");
      expect(lanes.operations).not.toContain("recordCreationAttempt");
      expect(mercadoPago.creationRequests).toEqual([]);
    });

    it("remembers that a retry's order may exist when Mercado Pago's answer to it is unknown", async () => {
      const { lanes, ports } = mercadoPagoQrOrderWorld({ creation: { kind: "unavailable" } });
      lanes.seed(storedTransaction());

      await createMercadoPagoQrOrder(ports, INPUT);

      expect(lanes.transactions.get(TRANSACTION_ID)?.creationOutcomeUnknown).toBe(true);
    });

    it("still remembers that an earlier attempt's order may exist when a retry is refused", async () => {
      const { lanes, ports } = mercadoPagoQrOrderWorld({ creation: { kind: "refused" } });
      lanes.seed(storedTransaction({ creationOutcomeUnknown: true }));

      await createMercadoPagoQrOrder(ports, INPUT);

      expect(lanes.transactions.get(TRANSACTION_ID)?.creationOutcomeUnknown).toBe(true);
    });

    it("keeps a payment pending for a person to review once its expiry is reached when a retry after an unknown answer is refused", async () => {
      const { lanes, mercadoPago, ports } = mercadoPagoQrOrderWorld({
        creation: { kind: "unavailable" },
      });
      await createMercadoPagoQrOrder(ports, INPUT);
      mercadoPago.creation = { kind: "refused" };
      await createMercadoPagoQrOrder(ports, INPUT);

      const { later, outcome } = await askAgainAtExpiry(lanes);

      expect(outcome).toMatchObject({
        kind: "recorded",
        transaction: { state: "PENDING", needsReview: true },
      });
      expect(later.mercadoPago.creationRequests).toEqual([]);
    });

    it("ends a payment whose every attempt was refused as expired once its expiry is reached, without calling Mercado Pago", async () => {
      const first = mercadoPagoQrOrderWorld({ creation: { kind: "refused" } });
      await createMercadoPagoQrOrder(first.ports, INPUT);
      const recorded = first.lanes.transactions.get(TRANSACTION_ID) ?? storedTransaction();
      const later = mercadoPagoQrOrderWorld({}, recorded.expiresAt);
      later.lanes.seed(recorded);

      const outcome = await createMercadoPagoQrOrder(later.ports, INPUT);

      expect(outcome).toMatchObject({
        kind: "recorded",
        transaction: { state: "EXPIRED", needsReview: false },
      });
      expect(later.lanes.transactions.get(TRANSACTION_ID)?.state).toBe("EXPIRED");
      expect(later.mercadoPago.creationRequests).toEqual([]);
    });

    it("keeps a payment whose attempt's answer is unknown pending for a person to review once its expiry is reached, never creating another order", async () => {
      const first = mercadoPagoQrOrderWorld({ creation: { kind: "unavailable" } });
      await createMercadoPagoQrOrder(first.ports, INPUT);
      const recorded = first.lanes.transactions.get(TRANSACTION_ID) ?? storedTransaction();
      const later = mercadoPagoQrOrderWorld({}, recorded.expiresAt);
      later.lanes.seed(recorded);

      const outcome = await createMercadoPagoQrOrder(later.ports, INPUT);
      const again = await createMercadoPagoQrOrder(later.ports, INPUT);

      const expected = { ...recorded, state: "PENDING" as const, needsReview: true };
      expect(outcome).toEqual({ kind: "recorded", transaction: expected });
      expect(again).toEqual({ kind: "recorded", transaction: expected });
      expect(later.lanes.transactions.get(TRANSACTION_ID)).toEqual(expected);
      expect(later.lanes.operations.filter((op) => op === "recordNeedsReview")).toHaveLength(1);
      expect(later.lanes.operations).not.toContain("recordCreationAttempt");
      expect(later.lanes.operations).not.toContain("recordExpired");
      expect(later.mercadoPago.creationRequests).toEqual([]);
      expect(later.mercadoPago.readOrders).toEqual([]);
    });

    it("follows the order a retry within the window finds after an attempt whose answer was unknown", async () => {
      const { lanes, mercadoPago, ports } = mercadoPagoQrOrderWorld({
        creation: { kind: "unavailable" },
      });
      await createMercadoPagoQrOrder(ports, INPUT);
      mercadoPago.creation = { kind: "created", orderId: "order-1", result: orderResult() };
      mercadoPago.reading = { kind: "read", result: paidOrderResult() };

      const outcome = await createMercadoPagoQrOrder(ports, INPUT);

      expect(mercadoPago.creationRequests).toHaveLength(2);
      expect(mercadoPago.creationRequests[1]).toEqual(mercadoPago.creationRequests[0]);
      expect(mercadoPago.readOrders).toEqual(["order-1"]);
      expect(outcome).toMatchObject({
        kind: "recorded",
        transaction: { state: "APPROVED", needsReview: false, providerOrderId: "order-1" },
      });
      expect(lanes.operations).not.toContain("recordNeedsReview");
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
        "recordCreationAttempt",
        "createQrOrder",
        "recordOrderCreated",
        "readOrder",
        "recordOrderResult",
        "leaveLane",
      ]);
      expect(mercadoPago.readOrders).toEqual(["order-1"]);
      expect(outcome).toMatchObject({ kind: "recorded", transaction: { state: "CANCELLED" } });
    });

    it("answers a retry's order exactly as it was recorded", async () => {
      const { lanes, ports } = mercadoPagoQrOrderWorld();
      lanes.seed(storedTransaction());

      const outcome = await createMercadoPagoQrOrder(ports, INPUT);

      expect(outcome).toEqual({
        kind: "recorded",
        transaction: lanes.transactions.get(TRANSACTION_ID),
      });
    });

    it("records the created order alone, so it stays pending with no result when recording the read fails", async () => {
      const { lanes, ports } = mercadoPagoQrOrderWorld({
        creation: { kind: "created", orderId: "order-1", result: paidOrderResult() },
      });
      lanes.seed(storedTransaction());
      lanes.failOn = "recordOrderResult";

      await expect(createMercadoPagoQrOrder(ports, INPUT)).rejects.toThrow(
        "recordOrderResult failed",
      );

      expect(lanes.transactions.get(TRANSACTION_ID)).toMatchObject({
        state: "PENDING",
        providerOrderId: "order-1",
      });
      expect(lanes.resultReadAt.size).toBe(0);
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

  it("keeps nothing of the creation answer when recording it fails, and the next ask sends the same request and reads the order", async () => {
    const { lanes, mercadoPago, ports } = mercadoPagoQrOrderWorld({
      creation: { kind: "created", orderId: "order-1", result: paidOrderResult() },
    });
    lanes.failOn = "recordOrderCreated";

    await expect(createMercadoPagoQrOrder(ports, INPUT)).rejects.toThrow(
      "recordOrderCreated failed",
    );
    expect(lanes.resultReadAt.size).toBe(0);
    expect(lanes.transactions.get(TRANSACTION_ID)).toMatchObject({
      state: "PENDING",
      needsReview: false,
      providerOrderId: null,
    });

    lanes.failOn = undefined;
    await createMercadoPagoQrOrder(ports, INPUT);

    expect(mercadoPago.creationRequests).toHaveLength(2);
    expect(mercadoPago.creationRequests[1]).toEqual(mercadoPago.creationRequests[0]);
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
