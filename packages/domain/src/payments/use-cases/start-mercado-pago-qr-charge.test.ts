import { describe, expect, it } from "vitest";
import { startMercadoPagoQrCharge } from "./start-mercado-pago-qr-charge.js";
import {
  FakeMercadoPagoQrChargeWorld,
  QR_ACTOR_ID,
  QR_CHARGE_NOW,
  QR_CHARGE_WAIT_ENDS_AT,
  QR_PAYMENT_ID,
  QR_SALE_ID,
} from "./test-support/mercado-pago-qr-charge-world.js";

const INPUT = { actorId: QR_ACTOR_ID, saleId: QR_SALE_ID, amount: 5000 };

describe("startMercadoPagoQrCharge", () => {
  it("keeps the pending payment, with the end of its 3-minute wait, before asking the cloud for the order", async () => {
    const world = new FakeMercadoPagoQrChargeWorld();

    await startMercadoPagoQrCharge(world.ports, INPUT);

    expect(world.recordedPayments).toEqual([
      { ...INPUT, occurredAt: QR_CHARGE_NOW, waitEndsAt: QR_CHARGE_WAIT_ENDS_AT },
    ]);
    expect(world.operations).toEqual(["recordPendingPayment", "requestOrder"]);
  });

  it("asks the cloud for an order of the pending payment's id, sale and amount", async () => {
    const world = new FakeMercadoPagoQrChargeWorld();

    await startMercadoPagoQrCharge(world.ports, INPUT);

    expect(world.requestedOrders).toEqual([
      { paymentTransactionId: QR_PAYMENT_ID, saleId: QR_SALE_ID, amount: 5000 },
    ]);
  });

  it("shows the order with the amount and the whole wait left once the cloud creates it", async () => {
    const world = new FakeMercadoPagoQrChargeWorld();

    expect(await startMercadoPagoQrCharge(world.ports, INPUT)).toEqual({
      kind: "order_shown",
      paymentTransactionId: QR_PAYMENT_ID,
      amount: 5000,
      remainingSeconds: 180,
    });
  });

  it("counts the time the cloud took to create the order against the wait", async () => {
    const world = new FakeMercadoPagoQrChargeWorld();
    world.requestOrder = async () => {
      world.now = new Date("2026-10-09T12:00:02.000Z");
      return { kind: "created" };
    };

    expect(await startMercadoPagoQrCharge(world.ports, INPUT)).toMatchObject({
      kind: "order_shown",
      remainingSeconds: 178,
    });
  });

  it("passes on the sale's refusal and asks the cloud for nothing", async () => {
    const world = new FakeMercadoPagoQrChargeWorld();
    world.saleRefusal = { kind: "exceeds_pending", pending: 3000 };

    expect(await startMercadoPagoQrCharge(world.ports, INPUT)).toEqual({
      kind: "exceeds_pending",
      pending: 3000,
    });
    expect(world.requestedOrders).toEqual([]);
  });

  it("answers that the order was refused, keeping the payment pending, when the cloud refuses it", async () => {
    const world = new FakeMercadoPagoQrChargeWorld();
    world.orderAnswer = { kind: "refused" };

    expect(await startMercadoPagoQrCharge(world.ports, INPUT)).toEqual({ kind: "order_refused" });
    expect(world.pendingCharge(QR_PAYMENT_ID)).not.toBeNull();
  });

  it("answers that the cloud is unreachable, keeping the payment pending, since the order may exist", async () => {
    const world = new FakeMercadoPagoQrChargeWorld();
    world.orderAnswer = { kind: "unreachable" };

    expect(await startMercadoPagoQrCharge(world.ports, INPUT)).toEqual({ kind: "unreachable" });
    expect(world.pendingCharge(QR_PAYMENT_ID)).not.toBeNull();
  });
});
