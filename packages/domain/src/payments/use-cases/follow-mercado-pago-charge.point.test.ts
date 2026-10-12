import { describe, expect, it } from "vitest";
import { followMercadoPagoCharge } from "./follow-mercado-pago-charge.js";
import {
  CHARGE_ACTOR_ID,
  CHARGE_PAYMENT_ID,
  FakeMercadoPagoChargeWorld,
} from "./test-support/mercado-pago-charge-world.js";

const INPUT = { actorId: CHARGE_ACTOR_ID, paymentTransactionId: CHARGE_PAYMENT_ID };
const AFTER_THE_WAIT = new Date("2026-10-09T12:03:00.000Z");

function followingWorld(): FakeMercadoPagoChargeWorld {
  const world = new FakeMercadoPagoChargeWorld();
  world.seedPending({ method: "POINT" });
  return world;
}

describe("followMercadoPagoCharge on the integrated terminal", () => {
  it("keeps waiting, with the seconds left, while the cloud reports the order pending", async () => {
    const world = followingWorld();
    world.now = new Date("2026-10-09T12:00:19.000Z");

    expect(await followMercadoPagoCharge(world.ports, INPUT)).toEqual({
      kind: "waiting",
      remainingSeconds: 161,
    });
  });

  it("keeps waiting while the cloud cannot be reached before the wait ends", async () => {
    const world = followingWorld();
    world.orderReading = { kind: "unreachable" };

    expect(await followMercadoPagoCharge(world.ports, INPUT)).toEqual({
      kind: "waiting",
      remainingSeconds: 180,
    });
  });

  it("asks to cancel on the terminal once the wait is over and the order is still pending, leaving the payment pending", async () => {
    const world = followingWorld();
    world.now = AFTER_THE_WAIT;

    expect(await followMercadoPagoCharge(world.ports, INPUT)).toEqual({
      kind: "at_terminal_wait_over",
    });
    expect(world.pendingCharge(CHARGE_PAYMENT_ID)).not.toBeNull();
    expect(world.operations).toEqual(["readOrder"]);
  });

  it("asks to cancel on the terminal once the wait is over even if the cloud cannot be reached", async () => {
    const world = followingWorld();
    world.now = AFTER_THE_WAIT;
    world.orderReading = { kind: "unreachable" };

    expect(await followMercadoPagoCharge(world.ports, INPUT)).toEqual({
      kind: "at_terminal_wait_over",
    });
  });

  it("keeps asking to cancel on the terminal however long after the wait it is followed again", async () => {
    const world = followingWorld();
    world.now = new Date("2026-10-09T18:00:00.000Z");

    expect(await followMercadoPagoCharge(world.ports, INPUT)).toEqual({
      kind: "at_terminal_wait_over",
    });
    expect(await followMercadoPagoCharge(world.ports, INPUT)).toEqual({
      kind: "at_terminal_wait_over",
    });
  });

  it("settles the payment on the sale when the customer pays on the terminal, even after the wait", async () => {
    const world = followingWorld();
    world.now = AFTER_THE_WAIT;
    world.orderReading = { kind: "read", state: "APPROVED" };

    expect(await followMercadoPagoCharge(world.ports, INPUT)).toEqual({
      kind: "approved",
      settlement: world.settlement,
    });
    expect(world.settledPayments).toEqual([INPUT]);
  });

  it("answers declined, ending the payment, when the terminal declines it", async () => {
    const world = followingWorld();
    world.orderReading = { kind: "read", state: "DECLINED" };

    expect(await followMercadoPagoCharge(world.ports, INPUT)).toEqual({ kind: "declined" });
    expect(world.pendingCharge(CHARGE_PAYMENT_ID)).toBeNull();
    expect(world.operations).toEqual(["readOrder", "recordEnded:DECLINED"]);
  });

  it.each(["CANCELLED", "EXPIRED"] as const)(
    "answers closed, ending the payment, when Mercado Pago reports the order %s",
    async (state) => {
      const world = followingWorld();
      world.orderReading = { kind: "read", state };

      expect(await followMercadoPagoCharge(world.ports, INPUT)).toEqual({ kind: "closed" });
      expect(world.pendingCharge(CHARGE_PAYMENT_ID)).toBeNull();
      expect(world.operations).toEqual(["readOrder", ["recordEnded", state].join(":")]);
    },
  );

  it("answers that no charge is pending once it is closed", async () => {
    const world = followingWorld();
    world.orderReading = { kind: "read", state: "EXPIRED" };
    await followMercadoPagoCharge(world.ports, INPUT);

    expect(await followMercadoPagoCharge(world.ports, INPUT)).toEqual({ kind: "not_pending" });
  });
});
