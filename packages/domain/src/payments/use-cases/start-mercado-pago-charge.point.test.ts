import { describe, expect, it } from "vitest";
import { startMercadoPagoCharge } from "./start-mercado-pago-charge.js";
import {
  CHARGE_ACTOR_ID,
  CHARGE_NOW,
  CHARGE_PAYMENT_ID,
  CHARGE_SALE_ID,
  CHARGE_WAIT_ENDS_AT,
  FakeMercadoPagoChargeWorld,
} from "./test-support/mercado-pago-charge-world.js";

const INPUT = {
  actorId: CHARGE_ACTOR_ID,
  saleId: CHARGE_SALE_ID,
  method: "POINT",
  amount: 5000,
} as const;

describe("startMercadoPagoCharge on the integrated terminal", () => {
  it("keeps the pending terminal payment, with the end of the register's 3-minute wait, before asking the cloud for the order", async () => {
    const world = new FakeMercadoPagoChargeWorld();

    await startMercadoPagoCharge(world.ports, INPUT);

    expect(world.recordedPayments).toEqual([
      { ...INPUT, occurredAt: CHARGE_NOW, waitEndsAt: CHARGE_WAIT_ENDS_AT },
    ]);
    expect(world.operations.slice(0, 2)).toEqual(["recordPendingPayment", "requestOrder"]);
    expect(world.requestedOrders).toEqual([
      {
        paymentTransactionId: CHARGE_PAYMENT_ID,
        saleId: CHARGE_SALE_ID,
        method: "POINT",
        amount: 5000,
      },
    ]);
  });

  it("shows the order with the wait left, counted from the start of the charge and not from the terminal's longer expiry", async () => {
    const world = new FakeMercadoPagoChargeWorld();
    world.orderAnswer = { kind: "created", expiresAt: new Date("2026-10-09T12:05:10.000Z") };

    expect(await startMercadoPagoCharge(world.ports, INPUT)).toEqual({
      kind: "order_shown",
      paymentTransactionId: CHARGE_PAYMENT_ID,
      amount: 5000,
      remainingSeconds: 180,
    });
    expect(world.pendingCharge(CHARGE_PAYMENT_ID)?.waitEndsAt).toEqual(CHARGE_WAIT_ENDS_AT);
    expect(world.operations).toEqual(["recordPendingPayment", "requestOrder"]);
  });

  it("passes on the sale's refusal and asks the cloud for nothing", async () => {
    const world = new FakeMercadoPagoChargeWorld();
    world.saleRefusal = { kind: "exceeds_pending", pending: 3000 };

    expect(await startMercadoPagoCharge(world.ports, INPUT)).toEqual({
      kind: "exceeds_pending",
      pending: 3000,
    });
    expect(world.requestedOrders).toEqual([]);
  });

  it("closes the payment as cancelled when the cloud refuses the order, as nothing was asked of the terminal", async () => {
    const world = new FakeMercadoPagoChargeWorld();
    world.orderAnswer = { kind: "refused" };

    expect(await startMercadoPagoCharge(world.ports, INPUT)).toEqual({ kind: "order_refused" });
    expect(world.pendingCharge(CHARGE_PAYMENT_ID)).toBeNull();
    expect(world.operations).toEqual([
      "recordPendingPayment",
      "requestOrder",
      "recordEnded:CANCELLED",
    ]);
  });

  it("keeps the payment pending when the cloud cannot be reached, since the terminal may already show the order", async () => {
    const world = new FakeMercadoPagoChargeWorld();
    world.orderAnswer = { kind: "unreachable" };

    expect(await startMercadoPagoCharge(world.ports, INPUT)).toEqual({ kind: "unreachable" });
    expect(world.pendingCharge(CHARGE_PAYMENT_ID)).not.toBeNull();
    expect(world.operations).toEqual(["recordPendingPayment", "requestOrder"]);
  });

  it.each(["not_configured", "below_minimum"] as const)(
    "closes the payment as cancelled and tells the cloud answered %s, as nothing was asked of the terminal",
    async (kind) => {
      const world = new FakeMercadoPagoChargeWorld();
      world.orderAnswer = { kind };

      expect(await startMercadoPagoCharge(world.ports, INPUT)).toEqual({ kind });
      expect(world.pendingCharge(CHARGE_PAYMENT_ID)).toBeNull();
      expect(world.operations).toEqual([
        "recordPendingPayment",
        "requestOrder",
        "recordEnded:CANCELLED",
      ]);
    },
  );
});
