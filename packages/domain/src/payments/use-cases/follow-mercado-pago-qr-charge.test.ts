import { describe, expect, it } from "vitest";
import { followMercadoPagoQrCharge } from "./follow-mercado-pago-qr-charge.js";
import {
  FakeMercadoPagoQrChargeWorld,
  QR_ACTOR_ID,
  QR_PAYMENT_ID,
  QR_SALE_ID,
} from "./test-support/mercado-pago-qr-charge-world.js";

const INPUT = { actorId: QR_ACTOR_ID, paymentTransactionId: QR_PAYMENT_ID };

function followingWorld(): FakeMercadoPagoQrChargeWorld {
  const world = new FakeMercadoPagoQrChargeWorld();
  world.seedPending();
  return world;
}

describe("followMercadoPagoQrCharge", () => {
  it("answers that no charge is pending, asking the cloud nothing, for a payment it does not keep as pending", async () => {
    const world = new FakeMercadoPagoQrChargeWorld();

    expect(await followMercadoPagoQrCharge(world.ports, INPUT)).toEqual({ kind: "not_pending" });
    expect(world.readOrders).toEqual([]);
  });

  it("keeps waiting, with the seconds left, while the cloud reports the order pending", async () => {
    const world = followingWorld();
    world.now = new Date("2026-10-09T12:00:19.000Z");

    expect(await followMercadoPagoQrCharge(world.ports, INPUT)).toEqual({
      kind: "waiting",
      remainingSeconds: 161,
    });
    expect(world.readOrders).toEqual([QR_PAYMENT_ID]);
  });

  it("keeps waiting while the cloud cannot be reached", async () => {
    const world = followingWorld();
    world.orderReading = { kind: "unreachable" };

    expect(await followMercadoPagoQrCharge(world.ports, INPUT)).toEqual({
      kind: "waiting",
      remainingSeconds: 180,
    });
  });

  it("answers the wait is over once 3 minutes pass, asking the cloud nothing and leaving the payment pending", async () => {
    const world = followingWorld();
    world.now = new Date("2026-10-09T12:03:00.000Z");

    expect(await followMercadoPagoQrCharge(world.ports, INPUT)).toEqual({ kind: "wait_over" });
    expect(world.readOrders).toEqual([]);
    expect(world.pendingCharge(QR_PAYMENT_ID)).not.toBeNull();
  });

  it("answers the wait is over once 3 minutes pass without reaching the cloud", async () => {
    const world = followingWorld();
    world.now = new Date("2026-10-09T12:04:00.000Z");
    world.orderReading = { kind: "unreachable" };

    expect(await followMercadoPagoQrCharge(world.ports, INPUT)).toEqual({ kind: "wait_over" });
  });

  it("settles the approved payment on the sale and passes on what the sale answers", async () => {
    const world = followingWorld();
    world.orderReading = { kind: "read", state: "APPROVED" };
    world.settlement = {
      kind: "partially_paid",
      saleId: QR_SALE_ID,
      total: 8000,
      paid: 5000,
      pending: 3000,
    };

    expect(await followMercadoPagoQrCharge(world.ports, INPUT)).toEqual({
      kind: "approved",
      settlement: world.settlement,
    });
    expect(world.settledPayments).toEqual([INPUT]);
  });

  it("never settles a payment approved once the wait ran out, leaving it for a late payment", async () => {
    const world = followingWorld();
    world.now = new Date("2026-10-09T12:03:00.000Z");
    world.orderReading = { kind: "read", state: "APPROVED" };

    expect(await followMercadoPagoQrCharge(world.ports, INPUT)).toEqual({ kind: "wait_over" });
    expect(world.settledPayments).toEqual([]);
    expect(world.readOrders).toEqual([]);
    expect(world.pendingCharge(QR_PAYMENT_ID)).not.toBeNull();
  });

  it("settles a payment approved in the wait's last second", async () => {
    const world = followingWorld();
    world.now = new Date("2026-10-09T12:02:59.999Z");
    world.orderReading = { kind: "read", state: "APPROVED" };

    expect(await followMercadoPagoQrCharge(world.ports, INPUT)).toMatchObject({
      kind: "approved",
    });
  });

  it.each(["DECLINED", "CANCELLED", "EXPIRED"] as const)(
    "declines the payment and records it %s when the order ends that way",
    async (state) => {
      const world = followingWorld();
      world.orderReading = { kind: "read", state };

      expect(await followMercadoPagoQrCharge(world.ports, INPUT)).toEqual({ kind: "declined" });
      expect(world.operations).toEqual(["readOrder", `recordEnded:${state}`]);
      expect(world.settledPayments).toEqual([]);
    },
  );
});
