import { describe, expect, it } from "vitest";
import { cancelMercadoPagoOrder } from "./cancel-mercado-pago-order.js";
import { checkPendingMercadoPagoPayments } from "./check-pending-mercado-pago-payments.js";
import {
  mercadoPagoOrderWorld,
  orderResult,
  paidOrderResult,
  QR_CANCELLATION,
  storedTransaction,
  TRANSACTION_ID,
} from "./test-support/mercado-pago-order-fixtures.js";

describe("checkPendingMercadoPagoPayments", () => {
  it("checks nothing when no payment is pending", async () => {
    const { lanes, mercadoPago, notificationPorts } = mercadoPagoOrderWorld();
    lanes.seed(storedTransaction({ id: "done", providerOrderId: "order-1", state: "APPROVED" }));

    expect(await checkPendingMercadoPagoPayments(notificationPorts)).toEqual({
      kind: "checked",
      refreshed: 0,
      unavailable: 0,
    });
    expect(mercadoPago.readOrders).toEqual([]);
  });

  it("re-reads every pending order in a lane of its own and applies what Mercado Pago answers", async () => {
    const { lanes, mercadoPago, notificationPorts } = mercadoPagoOrderWorld({
      reading: { kind: "read", result: paidOrderResult() },
    });
    lanes.seed(storedTransaction({ id: "first", providerOrderId: "order-1" }));
    lanes.seed(storedTransaction({ id: "second", providerOrderId: "order-2" }));
    lanes.seed(storedTransaction({ id: "done", providerOrderId: "order-3", state: "DECLINED" }));

    const outcome = await checkPendingMercadoPagoPayments(notificationPorts);

    expect(outcome).toEqual({ kind: "checked", refreshed: 2, unavailable: 0 });
    expect(lanes.lanesEntered).toEqual(["first", "second"]);
    expect(mercadoPago.readOrders).toEqual(["order-1", "order-2"]);
    expect(lanes.transactions.get("first")?.state).toBe("APPROVED");
    expect(lanes.transactions.get("second")?.state).toBe("APPROVED");
    expect(lanes.transactions.get("done")?.state).toBe("DECLINED");
  });

  it("keeps checking the others when Mercado Pago cannot be read for one", async () => {
    const { lanes, mercadoPago, notificationPorts } = mercadoPagoOrderWorld({
      reading: { kind: "read", result: paidOrderResult() },
    });
    mercadoPago.readingsByOrder.set("order-1", { kind: "unavailable" });
    lanes.seed(storedTransaction({ id: "first", providerOrderId: "order-1" }));
    lanes.seed(storedTransaction({ id: "second", providerOrderId: "order-2" }));

    const outcome = await checkPendingMercadoPagoPayments(notificationPorts);

    expect(outcome).toEqual({ kind: "checked", refreshed: 1, unavailable: 1 });
    expect(lanes.transactions.get("first")?.state).toBe("PENDING");
    expect(lanes.transactions.get("second")?.state).toBe("APPROVED");
  });

  it("ends a pending payment that never got an order once its time is over", async () => {
    const { lanes, mercadoPago, notificationPorts } = mercadoPagoOrderWorld();
    lanes.seed(storedTransaction({ expiresAt: new Date("2026-10-09T11:59:59.000Z") }));

    await checkPendingMercadoPagoPayments(notificationPorts);

    expect(lanes.transactions.get("transaction-1")?.state).toBe("EXPIRED");
    expect(mercadoPago.readOrders).toEqual([]);
  });

  it("applies the current state of a payment that changed after the list was read", async () => {
    const { lanes, directory, mercadoPago, notificationPorts } = mercadoPagoOrderWorld({
      reading: { kind: "read", result: orderResult() },
    });
    lanes.seed(storedTransaction({ providerOrderId: "order-1", state: "APPROVED" }));
    directory.staleListing = [{ id: "transaction-1", registerId: "register-1" }];

    const outcome = await checkPendingMercadoPagoPayments(notificationPorts);

    expect(outcome).toEqual({ kind: "checked", refreshed: 1, unavailable: 0 });
    expect(mercadoPago.readOrders).toEqual([]);
    expect(lanes.transactions.get("transaction-1")?.state).toBe("APPROVED");
  });

  it("skips a listed payment that no longer exists", async () => {
    const { directory, notificationPorts } = mercadoPagoOrderWorld();
    directory.staleListing = [{ id: "gone", registerId: "register-1" }];

    expect(await checkPendingMercadoPagoPayments(notificationPorts)).toEqual({
      kind: "checked",
      refreshed: 0,
      unavailable: 0,
    });
  });

  describe("a payment replaced by another method", () => {
    const REPLACED = { providerOrderId: "order-1", replaced: true };

    it("cancels its order instead of only reading it", async () => {
      const { lanes, mercadoPago, notificationPorts } = mercadoPagoOrderWorld();
      lanes.seed(storedTransaction(REPLACED));

      const outcome = await checkPendingMercadoPagoPayments(notificationPorts);

      expect(outcome).toEqual({ kind: "checked", refreshed: 1, unavailable: 0 });
      expect(mercadoPago.cancellations).toEqual([
        { orderId: "order-1", idempotencyKey: "cancellation-key-1" },
      ]);
      expect(lanes.transactions.get("transaction-1")).toMatchObject({
        state: "CANCELLED",
        replaced: true,
      });
    });

    it("approves it, still marked replaced, when the customer paid in the meantime", async () => {
      const { lanes, mercadoPago, notificationPorts } = mercadoPagoOrderWorld({
        reading: { kind: "read", result: paidOrderResult() },
      });
      lanes.seed(storedTransaction(REPLACED));

      const outcome = await checkPendingMercadoPagoPayments(notificationPorts);

      expect(outcome).toEqual({ kind: "checked", refreshed: 1, unavailable: 0 });
      expect(mercadoPago.cancellations).toEqual([]);
      expect(lanes.transactions.get("transaction-1")).toMatchObject({
        state: "APPROVED",
        replaced: true,
      });
    });

    it("stays pending and is counted unavailable when Mercado Pago cannot cancel it now", async () => {
      const { lanes, mercadoPago, notificationPorts } = mercadoPagoOrderWorld();
      mercadoPago.cancellation = { kind: "unavailable" };
      lanes.seed(storedTransaction(REPLACED));

      const outcome = await checkPendingMercadoPagoPayments(notificationPorts);

      expect(outcome).toEqual({ kind: "checked", refreshed: 0, unavailable: 1 });
      expect(lanes.transactions.get("transaction-1")?.state).toBe("PENDING");
    });

    it("is tried again on the next cycle after Mercado Pago was unavailable", async () => {
      const { lanes, mercadoPago, notificationPorts } = mercadoPagoOrderWorld();
      mercadoPago.cancellation = { kind: "unavailable" };
      lanes.seed(storedTransaction(REPLACED));
      await checkPendingMercadoPagoPayments(notificationPorts);
      mercadoPago.cancellation = {
        kind: "cancelled",
        result: orderResult({ status: "canceled", statusDetail: "canceled" }),
      };

      await checkPendingMercadoPagoPayments(notificationPorts);

      expect(mercadoPago.cancellations).toHaveLength(2);
      expect(lanes.transactions.get("transaction-1")?.state).toBe("CANCELLED");
    });

    it("is final, and not tried again, once Mercado Pago cannot cancel an order that is already cancelled", async () => {
      const { lanes, mercadoPago, notificationPorts } = mercadoPagoOrderWorld();
      mercadoPago.cancellation = { kind: "cannot_cancel" };
      mercadoPago.queuedReadings.push(
        { kind: "read", result: orderResult() },
        { kind: "read", result: orderResult({ status: "canceled", statusDetail: "canceled" }) },
      );
      lanes.seed(storedTransaction(REPLACED));
      await checkPendingMercadoPagoPayments(notificationPorts);

      const second = await checkPendingMercadoPagoPayments(notificationPorts);

      expect(second).toEqual({ kind: "checked", refreshed: 0, unavailable: 0 });
      expect(mercadoPago.cancellations).toHaveLength(1);
      expect(lanes.transactions.get("transaction-1")?.state).toBe("CANCELLED");
    });

    it("cancels with a new key, different from the one the order was created with", async () => {
      const { lanes, mercadoPago, notificationPorts } = mercadoPagoOrderWorld();
      lanes.seed(storedTransaction(REPLACED));

      await checkPendingMercadoPagoPayments(notificationPorts);

      const keys = mercadoPago.cancellations.map((c) => c.idempotencyKey);
      expect(keys).toEqual(["cancellation-key-1"]);
      expect(keys).not.toContain(TRANSACTION_ID);
    });

    it("cancels with its own key after the route's cancellation failed", async () => {
      const { lanes, mercadoPago, ports, notificationPorts } = mercadoPagoOrderWorld({
        reading: { kind: "read", result: orderResult() },
      });
      mercadoPago.cancellation = { kind: "unavailable" };
      lanes.seed(storedTransaction({ providerOrderId: "order-1" }));
      await cancelMercadoPagoOrder(ports, QR_CANCELLATION);
      lanes.seed({ ...storedTransaction({ providerOrderId: "order-1" }), replaced: true });
      mercadoPago.cancellation = {
        kind: "cancelled",
        result: orderResult({ status: "canceled", statusDetail: "canceled" }),
      };

      await checkPendingMercadoPagoPayments(notificationPorts);

      const keys = mercadoPago.cancellations.map((c) => c.idempotencyKey);
      expect(keys).toEqual(["cancellation-key-1", "cancellation-key-2"]);
      expect(keys).not.toContain(TRANSACTION_ID);
      expect(lanes.transactions.get(TRANSACTION_ID)?.state).toBe("CANCELLED");
    });

    it("is final when its order expired and cannot be cancelled", async () => {
      const { lanes, mercadoPago, notificationPorts } = mercadoPagoOrderWorld();
      mercadoPago.cancellation = { kind: "cannot_cancel" };
      mercadoPago.queuedReadings.push(
        { kind: "read", result: orderResult() },
        { kind: "read", result: orderResult({ status: "expired", statusDetail: "expired" }) },
      );
      lanes.seed(storedTransaction(REPLACED));

      const outcome = await checkPendingMercadoPagoPayments(notificationPorts);

      expect(outcome).toEqual({ kind: "checked", refreshed: 1, unavailable: 0 });
      expect(lanes.transactions.get("transaction-1")?.state).toBe("EXPIRED");
    });

    it("does not cancel a payment that is not replaced", async () => {
      const { lanes, mercadoPago, notificationPorts } = mercadoPagoOrderWorld();
      lanes.seed(storedTransaction({ providerOrderId: "order-1" }));

      await checkPendingMercadoPagoPayments(notificationPorts);

      expect(mercadoPago.cancellations).toEqual([]);
    });

    it("ends one that never got an order once its time is over", async () => {
      const { lanes, mercadoPago, notificationPorts } = mercadoPagoOrderWorld();
      lanes.seed(
        storedTransaction({ replaced: true, expiresAt: new Date("2026-10-09T11:59:59.000Z") }),
      );

      const outcome = await checkPendingMercadoPagoPayments(notificationPorts);

      expect(outcome).toEqual({ kind: "checked", refreshed: 1, unavailable: 0 });
      expect(mercadoPago.cancellations).toEqual([]);
      expect(lanes.transactions.get("transaction-1")?.state).toBe("EXPIRED");
    });
  });
});
