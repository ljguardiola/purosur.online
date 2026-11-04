import { describe, expect, it } from "vitest";
import { checkPendingMercadoPagoPayments } from "./check-pending-mercado-pago-payments.js";
import {
  mercadoPagoOrderWorld,
  orderResult,
  paidOrderResult,
  storedPointTransaction,
  TRANSACTION_ID,
} from "./test-support/mercado-pago-order-fixtures.js";

const REPLACED_POINT = { providerOrderId: "order-1", replaced: true };
const AT_TERMINAL = orderResult({ status: "at_terminal", statusDetail: "at_terminal" });

function replacedOrderAtTerminal(reading = AT_TERMINAL) {
  const world = mercadoPagoOrderWorld({ reading: { kind: "read", result: reading } });
  world.mercadoPago.cancellation = { kind: "cannot_cancel" };
  world.lanes.seed(storedPointTransaction(REPLACED_POINT));
  return world;
}

describe("checkPendingMercadoPagoPayments on a replaced Point payment", () => {
  it("keeps following an order Mercado Pago refuses to cancel because it is at the terminal, on every run", async () => {
    const { lanes, mercadoPago, notificationPorts } = replacedOrderAtTerminal();

    const first = await checkPendingMercadoPagoPayments(notificationPorts);
    const second = await checkPendingMercadoPagoPayments(notificationPorts);

    expect([first, second]).toEqual([
      { kind: "checked", refreshed: 1, unavailable: 0 },
      { kind: "checked", refreshed: 1, unavailable: 0 },
    ]);
    expect(mercadoPago.cancellations).toHaveLength(2);
    expect(lanes.transactions.get(TRANSACTION_ID)).toMatchObject({
      state: "PENDING",
      replaced: true,
    });
    expect(lanes.latePaymentRefunds.size).toBe(0);
  });

  it.each([
    ["canceled", "CANCELLED"],
    ["expired", "EXPIRED"],
  ] as const)(
    "closes it with nothing to do when Mercado Pago reports the order %s",
    async (status, state) => {
      const { lanes, mercadoPago, notificationPorts } = replacedOrderAtTerminal(
        orderResult({ status, statusDetail: status }),
      );

      await checkPendingMercadoPagoPayments(notificationPorts);
      const next = await checkPendingMercadoPagoPayments(notificationPorts);

      expect(next).toEqual({ kind: "checked", refreshed: 0, unavailable: 0 });
      expect(lanes.transactions.get(TRANSACTION_ID)).toMatchObject({ state, replaced: true });
      expect(mercadoPago.cancellations).toEqual([]);
      expect(lanes.latePaymentRefunds.size).toBe(0);
    },
  );

  it("closes it with nothing to do when the order is cancelled on the terminal after a refused cancellation", async () => {
    const { lanes, mercadoPago, notificationPorts } = replacedOrderAtTerminal();
    await checkPendingMercadoPagoPayments(notificationPorts);
    mercadoPago.reading = {
      kind: "read",
      result: orderResult({ status: "canceled", statusDetail: "canceled" }),
    };

    await checkPendingMercadoPagoPayments(notificationPorts);

    expect(lanes.transactions.get(TRANSACTION_ID)).toMatchObject({
      state: "CANCELLED",
      replaced: true,
    });
    expect(lanes.latePaymentRefunds.size).toBe(0);
  });

  it("opens the late payment refund when Mercado Pago reports the order paid", async () => {
    const { lanes, mercadoPago, notificationPorts } = replacedOrderAtTerminal();
    await checkPendingMercadoPagoPayments(notificationPorts);
    mercadoPago.reading = { kind: "read", result: paidOrderResult() };

    await checkPendingMercadoPagoPayments(notificationPorts);

    expect(lanes.transactions.get(TRANSACTION_ID)).toMatchObject({
      state: "APPROVED",
      replaced: true,
    });
    expect([...lanes.latePaymentRefunds.values()].map(({ refund }) => refund.paymentId)).toEqual([
      TRANSACTION_ID,
    ]);
  });
});
