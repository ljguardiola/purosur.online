import { describe, expect, it } from "vitest";
import { abandonMercadoPagoCharge } from "./abandon-mercado-pago-charge.js";
import {
  CHARGE_ACTOR_ID,
  CHARGE_PAYMENT_ID,
  FakeMercadoPagoChargeWorld,
} from "./test-support/mercado-pago-charge-world.js";

const INPUT = { actorId: CHARGE_ACTOR_ID, paymentTransactionId: CHARGE_PAYMENT_ID };

function abandoningWorld(): FakeMercadoPagoChargeWorld {
  const world = new FakeMercadoPagoChargeWorld();
  world.seedPending({ method: "POINT" });
  return world;
}

describe("abandonMercadoPagoCharge on the integrated terminal", () => {
  it("records the payment as cancelled once the cloud cancels the order", async () => {
    const world = abandoningWorld();

    expect(await abandonMercadoPagoCharge(world.ports, INPUT)).toEqual({ kind: "cancelled" });
    expect(world.operations).toEqual(["cancelOrder", "recordEnded:CANCELLED"]);
    expect(world.pendingCharge(CHARGE_PAYMENT_ID)).toBeNull();
  });

  it("tells that it can only be cancelled on the terminal, changing nothing", async () => {
    const world = abandoningWorld();
    world.orderCancellation = { kind: "cancel_on_terminal" };

    expect(await abandonMercadoPagoCharge(world.ports, INPUT)).toEqual({
      kind: "cancel_on_terminal",
    });
    expect(world.operations).toEqual(["cancelOrder"]);
    expect(world.pendingCharge(CHARGE_PAYMENT_ID)).not.toBeNull();
  });

  it("settles the payment when the customer already paid", async () => {
    const world = abandoningWorld();
    world.orderCancellation = { kind: "answered", state: "APPROVED" };

    expect(await abandonMercadoPagoCharge(world.ports, INPUT)).toEqual({
      kind: "already_paid",
      settlement: world.settlement,
    });
    expect(world.settledPayments).toEqual([INPUT]);
  });

  it.each(["DECLINED", "EXPIRED"] as const)(
    "records a payment the cloud reports %s as closed",
    async (state) => {
      const world = abandoningWorld();
      world.orderCancellation = { kind: "answered", state };

      expect(await abandonMercadoPagoCharge(world.ports, INPUT)).toEqual({ kind: "closed" });
      expect(world.operations).toEqual(["cancelOrder", ["recordEnded", state].join(":")]);
    },
  );

  it("refuses when the cloud cannot be reached, never replacing the payment, which stays pending", async () => {
    const world = abandoningWorld();
    world.orderCancellation = { kind: "unreachable" };

    expect(await abandonMercadoPagoCharge(world.ports, INPUT)).toEqual({ kind: "unreachable" });
    expect(world.operations).toEqual(["cancelOrder"]);
    expect(world.replacedPayments).toEqual([]);
    expect(world.pendingCharge(CHARGE_PAYMENT_ID)).not.toBeNull();
  });

  it("refuses, never replacing the payment, when the cloud answers the order is still pending", async () => {
    const world = abandoningWorld();
    world.orderCancellation = { kind: "answered", state: "PENDING" };

    expect(await abandonMercadoPagoCharge(world.ports, INPUT)).toEqual({ kind: "unreachable" });
    expect(world.replacedPayments).toEqual([]);
    expect(world.pendingCharge(CHARGE_PAYMENT_ID)).not.toBeNull();
  });

  it.each(["POINT", "QR"] as const)(
    "records a %s payment the cloud never recorded as cancelled, never replacing it",
    async (method) => {
      const world = new FakeMercadoPagoChargeWorld();
      world.seedPending({ method });
      world.orderCancellation = { kind: "not_recorded" };

      expect(await abandonMercadoPagoCharge(world.ports, INPUT)).toEqual({ kind: "cancelled" });
      expect(world.operations).toEqual(["cancelOrder", "recordEnded:CANCELLED"]);
      expect(world.pendingCharge(CHARGE_PAYMENT_ID)).toBeNull();
    },
  );

  it("replaces a QR payment the cloud cannot cancel, as before", async () => {
    const world = new FakeMercadoPagoChargeWorld();
    world.seedPending({ method: "QR" });
    world.orderCancellation = { kind: "cancel_on_terminal" };

    expect(await abandonMercadoPagoCharge(world.ports, INPUT)).toEqual({ kind: "replaced" });
  });
});
