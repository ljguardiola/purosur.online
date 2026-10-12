import { describe, expect, it } from "vitest";
import { createMercadoPagoPointOrder } from "./create-mercado-pago-point-order.js";
import {
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

const AMOUNT = 2500;
const INPUT = {
  registerId: REGISTER_ID,
  paymentTransactionId: TRANSACTION_ID,
  saleId: SALE_ID,
  amount: AMOUNT,
};

describe("createMercadoPagoPointOrder", () => {
  it("records the pending Point payment before calling Mercado Pago, holding the transaction's lane the whole time", async () => {
    const { lanes, mercadoPago, ports } = mercadoPagoOrderWorld();

    await createMercadoPagoPointOrder(ports, INPUT);

    expect(lanes.operations).toEqual([
      "enterLane",
      "recordedTransaction",
      "recordPendingTransaction",
      "createPointOrder",
      "recordOrderCreated",
      "recordNoOtherOrderPossible",
      "leaveLane",
    ]);
    expect(mercadoPago.heldLaneDuringCall).toBe(true);
    expect(mercadoPago.recordedDuringCreation).toMatchObject({
      method: "POINT",
      provider: "MERCADOPAGO_POINT",
      creationOutcomeUnknown: true,
    });
  });

  it("asks for the exact amount, identified by the payment transaction, expiring in the 5 minutes the terminal keeps an order, and names no terminal", async () => {
    const { mercadoPago, ports } = mercadoPagoOrderWorld();

    await createMercadoPagoPointOrder(ports, INPUT);

    expect(mercadoPago.pointCreationRequests).toEqual([
      {
        idempotencyKey: TRANSACTION_ID,
        externalReference: TRANSACTION_ID,
        amount: AMOUNT,
        expiresAfterMinutes: 5,
      },
    ]);
    expect(mercadoPago.creationRequests).toEqual([]);
  });

  it("reports a new order as a pending Point payment that expires 5 minutes after it was asked for, plus the longest the creation call can take", async () => {
    const { lanes, ports } = mercadoPagoOrderWorld();

    const outcome = await createMercadoPagoPointOrder(ports, INPUT);

    const expected = storedPointTransaction({
      amount: AMOUNT,
      providerOrderId: "order-1",
      creationOutcomeUnknown: false,
      createdAt: NOW,
      expiresAt: new Date("2026-10-09T12:05:10.000Z"),
    });
    expect(outcome).toEqual({ kind: "recorded", transaction: expected });
    expect(lanes.transactions.get(TRANSACTION_ID)).toEqual(expected);
  });

  it("trusts the answer of a new order's creation", async () => {
    const { ports } = mercadoPagoOrderWorld({
      pointCreation: { kind: "created", orderId: "order-1", result: paidOrderResult(AMOUNT) },
    });

    const outcome = await createMercadoPagoPointOrder(ports, INPUT);

    expect(outcome).toMatchObject({ kind: "recorded", transaction: { state: "APPROVED" } });
  });

  it("accepts exactly the minimum amount", async () => {
    const { mercadoPago, ports } = mercadoPagoOrderWorld();

    const outcome = await createMercadoPagoPointOrder(ports, { ...INPUT, amount: 1500 });

    expect(outcome).toMatchObject({ kind: "recorded" });
    expect(mercadoPago.pointCreationRequests).toHaveLength(1);
  });

  it.each([1, 1499])(
    "refuses the amount %s as under the terminal's minimum without recording anything nor calling Mercado Pago",
    async (amount) => {
      const { lanes, mercadoPago, ports } = mercadoPagoOrderWorld();

      const outcome = await createMercadoPagoPointOrder(ports, { ...INPUT, amount });

      expect(outcome).toEqual({ kind: "below_minimum" });
      expect(lanes.operations).toEqual([]);
      expect(mercadoPago.pointCreationRequests).toEqual([]);
    },
  );

  it.each([0, -100, 2500.5, Number.NaN])(
    "refuses the amount %s as invalid without recording anything",
    async (amount) => {
      const { lanes, mercadoPago, ports } = mercadoPagoOrderWorld();

      const outcome = await createMercadoPagoPointOrder(ports, { ...INPUT, amount });

      expect(outcome).toEqual({ kind: "invalid_amount" });
      expect(lanes.operations).toEqual([]);
      expect(mercadoPago.pointCreationRequests).toEqual([]);
    },
  );

  it("answers that no terminal is configured, keeping the payment pending with no order possibly created", async () => {
    const { lanes, ports } = mercadoPagoOrderWorld({ pointCreation: { kind: "not_configured" } });

    const outcome = await createMercadoPagoPointOrder(ports, INPUT);

    expect(outcome).toEqual({ kind: "not_configured" });
    expect(lanes.transactions.get(TRANSACTION_ID)).toMatchObject({
      method: "POINT",
      state: "PENDING",
      providerOrderId: null,
      creationOutcomeUnknown: false,
    });
  });

  it("records that a retry created nothing when no terminal is configured and no earlier attempt may have created an order", async () => {
    const { lanes, ports } = mercadoPagoOrderWorld({ pointCreation: { kind: "not_configured" } });
    lanes.seed(storedPointTransaction({ amount: AMOUNT, creationOutcomeUnknown: false }));

    const outcome = await createMercadoPagoPointOrder(ports, INPUT);

    expect(outcome).toEqual({ kind: "not_configured" });
    expect(lanes.operations).toContain("recordCreationCreatedNothing");
  });

  it("still remembers that an earlier attempt's order may exist when a retry finds no terminal configured", async () => {
    const { lanes, ports } = mercadoPagoOrderWorld({ pointCreation: { kind: "not_configured" } });
    lanes.seed(storedPointTransaction({ amount: AMOUNT, creationOutcomeUnknown: true }));

    const outcome = await createMercadoPagoPointOrder(ports, INPUT);

    expect(outcome).toEqual({ kind: "not_configured" });
    expect(lanes.operations).not.toContain("recordCreationCreatedNothing");
    expect(lanes.transactions.get(TRANSACTION_ID)?.creationOutcomeUnknown).toBe(true);
  });

  it("answers refused when Mercado Pago refuses the order", async () => {
    const { lanes, ports } = mercadoPagoOrderWorld({ pointCreation: { kind: "refused" } });

    const outcome = await createMercadoPagoPointOrder(ports, INPUT);

    expect(outcome).toEqual({ kind: "provider_refused" });
    expect(lanes.transactions.get(TRANSACTION_ID)?.creationOutcomeUnknown).toBe(false);
  });

  it("keeps remembering that the order may exist when Mercado Pago's answer to the creation is unknown", async () => {
    const { lanes, ports } = mercadoPagoOrderWorld({ pointCreation: { kind: "unavailable" } });

    const outcome = await createMercadoPagoPointOrder(ports, INPUT);

    expect(outcome).toEqual({ kind: "provider_unavailable" });
    expect(lanes.transactions.get(TRANSACTION_ID)).toMatchObject({
      state: "PENDING",
      creationOutcomeUnknown: true,
    });
  });

  it("answers unavailable when Mercado Pago asks to try again later", async () => {
    const { ports } = mercadoPagoOrderWorld({ pointCreation: { kind: "throttled" } });

    expect(await createMercadoPagoPointOrder(ports, INPUT)).toEqual({
      kind: "provider_unavailable",
    });
  });

  it("answers a request that differs from the recorded one as a mismatch without calling Mercado Pago", async () => {
    const { lanes, mercadoPago, ports } = mercadoPagoOrderWorld();
    lanes.seed(storedPointTransaction({ amount: AMOUNT }));

    const otherSale = await createMercadoPagoPointOrder(ports, { ...INPUT, saleId: "sale-2" });
    const otherAmount = await createMercadoPagoPointOrder(ports, { ...INPUT, amount: AMOUNT + 1 });

    expect(otherSale).toEqual({ kind: "request_mismatch" });
    expect(otherAmount).toEqual({ kind: "request_mismatch" });
    expect(mercadoPago.pointCreationRequests).toEqual([]);
  });

  it("answers a mismatch when the payment transaction recorded under that id is a QR one", async () => {
    const { lanes, mercadoPago, ports } = mercadoPagoOrderWorld();
    lanes.seed(storedTransaction({ amount: AMOUNT }));

    const outcome = await createMercadoPagoPointOrder(ports, INPUT);

    expect(outcome).toEqual({ kind: "request_mismatch" });
    expect(mercadoPago.pointCreationRequests).toEqual([]);
  });

  it("answers not owned when the payment transaction belongs to another register", async () => {
    const { lanes, mercadoPago, ports } = mercadoPagoOrderWorld();
    lanes.seed(storedPointTransaction({ registerId: "register-2", amount: AMOUNT }));

    const outcome = await createMercadoPagoPointOrder(ports, INPUT);

    expect(outcome).toEqual({ kind: "not_owned" });
    expect(mercadoPago.pointCreationRequests).toEqual([]);
  });

  it("reads back an order already created for a recorded payment instead of creating another", async () => {
    const { lanes, mercadoPago, ports } = mercadoPagoOrderWorld({
      reading: { kind: "read", result: orderResult({ status: "at_terminal" }) },
    });
    lanes.seed(storedPointTransaction({ amount: AMOUNT, providerOrderId: "order-1" }));

    const outcome = await createMercadoPagoPointOrder(ports, INPUT);

    expect(outcome).toMatchObject({ kind: "recorded", transaction: { state: "PENDING" } });
    expect(mercadoPago.pointCreationRequests).toEqual([]);
    expect(mercadoPago.readOrders).toEqual(["order-1"]);
  });
});
