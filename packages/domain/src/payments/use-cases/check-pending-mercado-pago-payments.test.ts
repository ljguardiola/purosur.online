import { describe, expect, it } from "vitest";
import { checkPendingMercadoPagoPayments } from "./check-pending-mercado-pago-payments.js";
import {
  mercadoPagoQrOrderWorld,
  orderResult,
  paidOrderResult,
  storedTransaction,
} from "./test-support/mercado-pago-qr-order-fixtures.js";

describe("checkPendingMercadoPagoPayments", () => {
  it("checks nothing when no payment is pending", async () => {
    const { lanes, mercadoPago, notificationPorts } = mercadoPagoQrOrderWorld();
    lanes.seed(storedTransaction({ id: "done", providerOrderId: "order-1", state: "APPROVED" }));

    expect(await checkPendingMercadoPagoPayments(notificationPorts)).toEqual({
      kind: "checked",
      refreshed: 0,
      unavailable: 0,
    });
    expect(mercadoPago.readOrders).toEqual([]);
  });

  it("re-reads every pending order in a lane of its own and applies what Mercado Pago answers", async () => {
    const { lanes, mercadoPago, notificationPorts } = mercadoPagoQrOrderWorld({
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
    const { lanes, mercadoPago, notificationPorts } = mercadoPagoQrOrderWorld({
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
    const { lanes, mercadoPago, notificationPorts } = mercadoPagoQrOrderWorld();
    lanes.seed(storedTransaction({ expiresAt: new Date("2026-10-09T11:59:59.000Z") }));

    await checkPendingMercadoPagoPayments(notificationPorts);

    expect(lanes.transactions.get("transaction-1")?.state).toBe("EXPIRED");
    expect(mercadoPago.readOrders).toEqual([]);
  });

  it("applies the current state of a payment that changed after the list was read", async () => {
    const { lanes, directory, mercadoPago, notificationPorts } = mercadoPagoQrOrderWorld({
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
    const { directory, notificationPorts } = mercadoPagoQrOrderWorld();
    directory.staleListing = [{ id: "gone", registerId: "register-1" }];

    expect(await checkPendingMercadoPagoPayments(notificationPorts)).toEqual({
      kind: "checked",
      refreshed: 0,
      unavailable: 0,
    });
  });
});
