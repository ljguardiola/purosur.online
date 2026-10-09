import { describe, expect, it } from "vitest";
import { readMercadoPagoQrPayment } from "./read-mercado-pago-qr-payment.js";
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

describe("readMercadoPagoQrPayment", () => {
  it("answers not found for a payment transaction that does not exist", async () => {
    const { mercadoPago, ports } = mercadoPagoQrOrderWorld();

    expect(await readMercadoPagoQrPayment(ports, INPUT)).toEqual({ kind: "not_found" });
    expect(mercadoPago.readOrders).toEqual([]);
  });

  it("answers not found for a payment transaction of another register", async () => {
    const { lanes, mercadoPago, ports } = mercadoPagoQrOrderWorld();
    lanes.seed(storedTransaction({ ...WITH_ORDER, registerId: "register-2" }));

    expect(await readMercadoPagoQrPayment(ports, INPUT)).toEqual({ kind: "not_found" });
    expect(mercadoPago.readOrders).toEqual([]);
  });

  it("approves a pending payment whose order is fully paid with the exact amount and records when it was read", async () => {
    const { lanes, mercadoPago, ports } = mercadoPagoQrOrderWorld({
      reading: { kind: "read", result: paidOrderResult() },
    });
    lanes.seed(storedTransaction(WITH_ORDER));

    const outcome = await readMercadoPagoQrPayment(ports, INPUT);

    const expected = storedTransaction({ ...WITH_ORDER, state: "APPROVED" });
    expect(outcome).toEqual({ kind: "read", transaction: expected });
    expect(lanes.transactions.get(TRANSACTION_ID)).toEqual(expected);
    expect(lanes.resultReadAt.get(TRANSACTION_ID)).toEqual(NOW);
    expect(mercadoPago.readOrders).toEqual(["order-1"]);
    expect(mercadoPago.heldLaneDuringCall).toBe(true);
  });

  it("keeps a payment whose order was paid a different amount pending, flagged for a person to review", async () => {
    const { lanes, ports } = mercadoPagoQrOrderWorld({
      reading: { kind: "read", result: paidOrderResult(2000) },
    });
    lanes.seed(storedTransaction(WITH_ORDER));

    const outcome = await readMercadoPagoQrPayment(ports, INPUT);

    expect(outcome).toMatchObject({
      kind: "read",
      transaction: { state: "PENDING", needsReview: true },
    });
    expect(lanes.transactions.get(TRANSACTION_ID)).toMatchObject({
      state: "PENDING",
      needsReview: true,
    });
  });

  it.each([
    ["canceled", "CANCELLED"],
    ["expired", "EXPIRED"],
    ["failed", "DECLINED"],
  ] as const)("ends a payment whose order is %s as %s", async (status, state) => {
    const { lanes, ports } = mercadoPagoQrOrderWorld({
      reading: { kind: "read", result: orderResult({ status }) },
    });
    lanes.seed(storedTransaction(WITH_ORDER));

    const outcome = await readMercadoPagoQrPayment(ports, INPUT);

    expect(outcome).toMatchObject({ kind: "read", transaction: { state } });
  });

  it.each(["APPROVED", "DECLINED", "CANCELLED", "EXPIRED"] as const)(
    "answers a %s payment as it is without calling Mercado Pago",
    async (state) => {
      const { lanes, mercadoPago, ports } = mercadoPagoQrOrderWorld({
        reading: { kind: "read", result: orderResult({ status: "canceled" }) },
      });
      lanes.seed(storedTransaction({ ...WITH_ORDER, state }));

      const outcome = await readMercadoPagoQrPayment(ports, INPUT);

      expect(outcome).toMatchObject({ kind: "read", transaction: { state } });
      expect(mercadoPago.readOrders).toEqual([]);
      expect(lanes.operations).not.toContain("recordOrderResult");
    },
  );

  it("answers a pending payment without an order as it is without calling Mercado Pago", async () => {
    const { lanes, mercadoPago, ports } = mercadoPagoQrOrderWorld();
    lanes.seed(storedTransaction());

    const outcome = await readMercadoPagoQrPayment(ports, INPUT);

    expect(outcome).toMatchObject({ kind: "read", transaction: { state: "PENDING" } });
    expect(mercadoPago.readOrders).toEqual([]);
  });

  it("answers provider unavailable and changes nothing when the order cannot be read", async () => {
    const { lanes, ports } = mercadoPagoQrOrderWorld({ reading: { kind: "unavailable" } });
    lanes.seed(storedTransaction(WITH_ORDER));

    expect(await readMercadoPagoQrPayment(ports, INPUT)).toEqual({ kind: "provider_unavailable" });
    expect(lanes.operations).not.toContain("recordOrderResult");
  });

  it("leaves the payment as it was when recording the result fails", async () => {
    const { lanes, ports } = mercadoPagoQrOrderWorld({
      reading: { kind: "read", result: paidOrderResult() },
    });
    lanes.seed(storedTransaction(WITH_ORDER));
    lanes.failOn = "recordOrderResult";

    await expect(readMercadoPagoQrPayment(ports, INPUT)).rejects.toThrow(
      "recordOrderResult failed",
    );

    expect(lanes.transactions.get(TRANSACTION_ID)?.state).toBe("PENDING");
  });
});
