import { describe, expect, it } from "vitest";
import { abandonMercadoPagoQrCharge } from "./abandon-mercado-pago-qr-charge.js";
import {
  FakeMercadoPagoQrChargeWorld,
  QR_ACTOR_ID,
  QR_PAYMENT_ID,
  QR_SALE_ID,
} from "./test-support/mercado-pago-qr-charge-world.js";

const INPUT = { actorId: QR_ACTOR_ID, paymentTransactionId: QR_PAYMENT_ID };

function abandoningWorld(): FakeMercadoPagoQrChargeWorld {
  const world = new FakeMercadoPagoQrChargeWorld();
  world.seedPending();
  return world;
}

describe("abandonMercadoPagoQrCharge", () => {
  it("answers that no charge is pending, asking the cloud nothing, for a payment it does not keep as pending", async () => {
    const world = new FakeMercadoPagoQrChargeWorld();

    expect(await abandonMercadoPagoQrCharge(world.ports, INPUT)).toEqual({ kind: "not_pending" });
    expect(world.operations).toEqual([]);
  });

  it("answers that no charge is pending for a payment already replaced, asking the cloud nothing", async () => {
    const world = abandoningWorld();
    world.orderCancellation = { kind: "unreachable" };
    await abandonMercadoPagoQrCharge(world.ports, INPUT);
    world.operations.length = 0;

    expect(await abandonMercadoPagoQrCharge(world.ports, INPUT)).toEqual({ kind: "not_pending" });
    expect(world.operations).toEqual([]);
  });

  it("records the payment as cancelled once the cloud confirms the cancellation", async () => {
    const world = abandoningWorld();

    expect(await abandonMercadoPagoQrCharge(world.ports, INPUT)).toEqual({ kind: "cancelled" });
    expect(world.cancelledOrders).toEqual([QR_PAYMENT_ID]);
    expect(world.operations).toEqual(["cancelOrder", "recordEnded:CANCELLED"]);
    expect(world.pendingCharge(QR_PAYMENT_ID)).toBeNull();
  });

  it("settles the payment on the sale when the cloud says the customer already paid, passing on what the sale answers", async () => {
    const world = abandoningWorld();
    world.orderCancellation = { kind: "answered", state: "APPROVED" };
    world.settlement = {
      kind: "partially_paid",
      saleId: QR_SALE_ID,
      total: 8000,
      paid: 5000,
      pending: 3000,
    };

    expect(await abandonMercadoPagoQrCharge(world.ports, INPUT)).toEqual({
      kind: "already_paid",
      settlement: world.settlement,
    });
    expect(world.settledPayments).toEqual([INPUT]);
    expect(world.operations).toEqual(["cancelOrder", "settleApprovedPayment"]);
  });

  it("completes the sale when the payment that was already paid covers it", async () => {
    const world = abandoningWorld();
    world.orderCancellation = { kind: "answered", state: "APPROVED" };

    expect(await abandonMercadoPagoQrCharge(world.ports, INPUT)).toEqual({
      kind: "already_paid",
      settlement: { kind: "completed", saleId: QR_SALE_ID, total: 5000 },
    });
  });

  it.each([
    "EXPIRED",
    "DECLINED",
  ] as const)("answers the order is closed, recording it %s and not asking again", async (state) => {
    const world = abandoningWorld();
    world.orderCancellation = { kind: "answered", state };

    expect(await abandonMercadoPagoQrCharge(world.ports, INPUT)).toEqual({ kind: "closed" });
    expect(world.operations).toEqual(["cancelOrder", `recordEnded:${state}`]);
    expect(await abandonMercadoPagoQrCharge(world.ports, INPUT)).toEqual({ kind: "not_pending" });
    expect(world.cancelledOrders).toEqual([QR_PAYMENT_ID]);
  });

  it.each([
    ["cannot be reached", { kind: "unreachable" } as const],
    ["still reports the order pending", { kind: "answered", state: "PENDING" } as const],
  ])("marks the payment replaced, leaving it pending, when the cloud %s", async (_name, cancellation) => {
    const world = abandoningWorld();
    world.orderCancellation = cancellation;
    world.now = new Date("2026-10-09T12:00:19.000Z");

    expect(await abandonMercadoPagoQrCharge(world.ports, INPUT)).toEqual({ kind: "replaced" });
    expect(world.replacedPayments).toEqual([{ ...INPUT, replacedAt: world.now }]);
    expect(world.operations).toEqual(["cancelOrder", "replacePendingPayment"]);
    expect(world.charges.get(QR_PAYMENT_ID)?.state).toBe("PENDING");
    expect(world.pendingCharge(QR_PAYMENT_ID)).toBeNull();
  });

  it("dates the replacement after the cloud was asked", async () => {
    const world = abandoningWorld();
    world.orderCancellation = { kind: "unreachable" };
    const asked: Date[] = [];
    const cancelOrder = world.cancelOrder.bind(world);
    world.cancelOrder = async (id) => {
      world.now = new Date("2026-10-09T12:00:07.000Z");
      asked.push(world.now);
      return cancelOrder(id);
    };

    await abandonMercadoPagoQrCharge(world.ports, INPUT);

    expect(world.replacedPayments[0]?.replacedAt).toEqual(asked[0]);
  });

  it("asks the cloud to cancel even once the wait is over", async () => {
    const world = abandoningWorld();
    world.now = new Date("2026-10-09T12:04:00.000Z");

    expect(await abandonMercadoPagoQrCharge(world.ports, INPUT)).toEqual({ kind: "cancelled" });
  });

  it("passes on why the sale cannot replace the payment, leaving it pending", async () => {
    const world = abandoningWorld();
    world.orderCancellation = { kind: "unreachable" };
    world.replacementRefusal = { kind: "no_open_sale" };

    expect(await abandonMercadoPagoQrCharge(world.ports, INPUT)).toEqual({
      kind: "no_open_sale",
    });
    expect(world.charges.get(QR_PAYMENT_ID)?.state).toBe("PENDING");
    expect(world.pendingCharge(QR_PAYMENT_ID)).not.toBeNull();
  });
});
