import { describe, expect, it } from "vitest";
import { abandonMercadoPagoCharge } from "./abandon-mercado-pago-charge.js";
import { followMercadoPagoCharge } from "./follow-mercado-pago-charge.js";
import {
  CHARGE_ACTOR_ID,
  CHARGE_PAYMENT_ID,
  CHARGE_SALE_ID,
  FakeMercadoPagoChargeWorld,
} from "./test-support/mercado-pago-charge-world.js";

const INPUT = { actorId: CHARGE_ACTOR_ID, paymentTransactionId: CHARGE_PAYMENT_ID };

function followingWorld(): FakeMercadoPagoChargeWorld {
  const world = new FakeMercadoPagoChargeWorld();
  world.seedPending();
  return world;
}

describe("followMercadoPagoCharge", () => {
  it("answers that no charge is pending, asking the cloud nothing, for a payment it does not keep as pending", async () => {
    const world = new FakeMercadoPagoChargeWorld();

    expect(await followMercadoPagoCharge(world.ports, INPUT)).toEqual({ kind: "not_pending" });
    expect(world.readOrders).toEqual([]);
  });

  it("answers that no charge is pending for a payment marked as replaced, asking the cloud nothing", async () => {
    const world = followingWorld();
    world.replacePendingPayment({
      actorId: CHARGE_ACTOR_ID,
      paymentTransactionId: CHARGE_PAYMENT_ID,
      replacedAt: world.now,
    });

    expect(await followMercadoPagoCharge(world.ports, INPUT)).toEqual({ kind: "not_pending" });
    expect(world.readOrders).toEqual([]);
  });

  it("keeps waiting, with the seconds left, while the cloud reports the order pending", async () => {
    const world = followingWorld();
    world.now = new Date("2026-10-09T12:00:19.000Z");

    expect(await followMercadoPagoCharge(world.ports, INPUT)).toEqual({
      kind: "waiting",
      remainingSeconds: 161,
    });
    expect(world.readOrders).toEqual([CHARGE_PAYMENT_ID]);
  });

  it("keeps waiting while the cloud cannot be reached", async () => {
    const world = followingWorld();
    world.orderReading = { kind: "unreachable" };

    expect(await followMercadoPagoCharge(world.ports, INPUT)).toEqual({
      kind: "waiting",
      remainingSeconds: 180,
    });
  });

  it("keeps waiting with no seconds left, leaving the payment pending, once the countdown ends and Mercado Pago still reports the order pending", async () => {
    const world = followingWorld();
    world.now = new Date("2026-10-09T12:03:00.000Z");

    expect(await followMercadoPagoCharge(world.ports, INPUT)).toEqual({
      kind: "waiting",
      remainingSeconds: 0,
    });
    expect(world.readOrders).toEqual([CHARGE_PAYMENT_ID]);
    expect(world.pendingCharge(CHARGE_PAYMENT_ID)).not.toBeNull();
  });

  it("answers the wait is over, recording the payment expired, once Mercado Pago reports the order expired", async () => {
    const world = followingWorld();
    world.now = new Date("2026-10-09T12:03:00.000Z");
    world.orderReading = { kind: "read", state: "EXPIRED" };

    expect(await followMercadoPagoCharge(world.ports, INPUT)).toEqual({ kind: "wait_over" });
    expect(world.operations).toEqual(["readOrder", "recordEnded:EXPIRED"]);
    expect(world.pendingCharge(CHARGE_PAYMENT_ID)).toBeNull();
    expect(world.settledPayments).toEqual([]);
  });

  it("answers the wait is over when Mercado Pago expires the order before the countdown ends", async () => {
    const world = followingWorld();
    world.orderReading = { kind: "read", state: "EXPIRED" };

    expect(await followMercadoPagoCharge(world.ports, INPUT)).toEqual({ kind: "wait_over" });
  });

  it("asks the cloud to cancel a payment it has no record of, with the payment's sale, method and amount, and answers the wait is over once the cloud confirms it cancelled", async () => {
    const world = followingWorld();
    world.orderReading = { kind: "not_recorded" };

    expect(await followMercadoPagoCharge(world.ports, INPUT)).toEqual({ kind: "wait_over" });
    expect(world.operations).toEqual(["readOrder", "cancelOrder", "recordEnded:CANCELLED"]);
    expect(world.cancelledOrders).toEqual([
      {
        paymentTransactionId: CHARGE_PAYMENT_ID,
        saleId: CHARGE_SALE_ID,
        method: "QR",
        amount: 5000,
      },
    ]);
    expect(world.pendingCharge(CHARGE_PAYMENT_ID)).toBeNull();
  });

  it("keeps waiting, leaving the payment pending, when the cloud has no record of it and cannot be reached to cancel it", async () => {
    const world = followingWorld();
    world.orderReading = { kind: "not_recorded" };
    world.orderCancellation = { kind: "unreachable" };

    expect(await followMercadoPagoCharge(world.ports, INPUT)).toEqual({
      kind: "waiting",
      remainingSeconds: 180,
    });
    expect(world.operations).toEqual(["readOrder", "cancelOrder"]);
    expect(world.pendingCharge(CHARGE_PAYMENT_ID)).not.toBeNull();
  });

  it("cannot confirm the expiry when the order cannot be read after the countdown ended, leaving the payment pending", async () => {
    const world = followingWorld();
    world.now = new Date("2026-10-09T12:03:00.000Z");
    world.orderReading = { kind: "unreachable" };

    expect(await followMercadoPagoCharge(world.ports, INPUT)).toEqual({
      kind: "expiry_unconfirmed",
    });
    expect(world.pendingCharge(CHARGE_PAYMENT_ID)).not.toBeNull();
    expect(world.operations).toEqual(["readOrder"]);
  });

  it("settles the approved payment on the sale and passes on what the sale answers", async () => {
    const world = followingWorld();
    world.orderReading = { kind: "read", state: "APPROVED" };
    world.settlement = {
      kind: "partially_paid",
      saleId: CHARGE_SALE_ID,
      total: 8000,
      paid: 5000,
      pending: 3000,
    };

    expect(await followMercadoPagoCharge(world.ports, INPUT)).toEqual({
      kind: "approved",
      settlement: world.settlement,
    });
    expect(world.settledPayments).toEqual([INPUT]);
  });

  it("settles a payment approved after the countdown ended but before Mercado Pago expired the order", async () => {
    const world = followingWorld();
    world.now = new Date("2026-10-09T12:03:05.000Z");
    world.orderReading = { kind: "read", state: "APPROVED" };

    expect(await followMercadoPagoCharge(world.ports, INPUT)).toMatchObject({
      kind: "approved",
    });
    expect(world.settledPayments).toEqual([INPUT]);
  });

  it("settles a payment approved in the wait's last second", async () => {
    const world = followingWorld();
    world.now = new Date("2026-10-09T12:02:59.999Z");
    world.orderReading = { kind: "read", state: "APPROVED" };

    expect(await followMercadoPagoCharge(world.ports, INPUT)).toMatchObject({
      kind: "approved",
    });
  });

  it.each(["DECLINED", "CANCELLED"] as const)(
    "declines the payment and records it %s when the order ends that way",
    async (state) => {
      const world = followingWorld();
      world.orderReading = { kind: "read", state };

      expect(await followMercadoPagoCharge(world.ports, INPUT)).toEqual({ kind: "declined" });
      expect(world.operations).toEqual(["readOrder", `recordEnded:${state}`]);
      expect(world.settledPayments).toEqual([]);
    },
  );
});

describe("a Mercado Pago QR charge followed and abandoned to its end", () => {
  it("completes the sale once when the customer pays after the countdown ended, and never again", async () => {
    const world = followingWorld();
    world.now = new Date("2026-10-09T12:03:05.000Z");
    world.scriptedReadings.push({ kind: "read", state: "APPROVED" });

    const first = await followMercadoPagoCharge(world.ports, INPUT);
    const second = await followMercadoPagoCharge(world.ports, INPUT);
    const abandoned = await abandonMercadoPagoCharge(world.ports, INPUT);

    expect(first).toMatchObject({ kind: "approved" });
    expect(second).toEqual({ kind: "not_pending" });
    expect(abandoned).toEqual({ kind: "not_pending" });
    expect(world.settledPayments).toEqual([INPUT]);
  });

  it("waits with nothing left, then ends as expired when Mercado Pago expires the order, without ever settling", async () => {
    const world = followingWorld();
    world.now = new Date("2026-10-09T12:03:00.000Z");
    world.scriptedReadings.push(
      { kind: "read", state: "PENDING" },
      { kind: "read", state: "EXPIRED" },
    );

    const outcomes = [
      await followMercadoPagoCharge(world.ports, INPUT),
      await followMercadoPagoCharge(world.ports, INPUT),
      await followMercadoPagoCharge(world.ports, INPUT),
    ];

    expect(outcomes).toEqual([
      { kind: "waiting", remainingSeconds: 0 },
      { kind: "wait_over" },
      { kind: "not_pending" },
    ]);
    expect(world.charges.get(CHARGE_PAYMENT_ID)?.state).toBe("EXPIRED");
    expect(world.settledPayments).toEqual([]);
  });

  it.each([
    ["cannot be reached", { kind: "unreachable" } as const],
    ["still reports the order pending", { kind: "answered", state: "PENDING" } as const],
  ])(
    "marks the payment replaced when the order cannot be confirmed expired and the cancellation %s",
    async (_name, cancellation) => {
      const world = followingWorld();
      world.now = new Date("2026-10-09T12:03:00.000Z");
      world.orderReading = { kind: "unreachable" };
      world.orderCancellation = cancellation;

      expect(await followMercadoPagoCharge(world.ports, INPUT)).toEqual({
        kind: "expiry_unconfirmed",
      });
      expect(await abandonMercadoPagoCharge(world.ports, INPUT)).toEqual({ kind: "replaced" });
      expect(await followMercadoPagoCharge(world.ports, INPUT)).toEqual({ kind: "not_pending" });
      expect(world.settledPayments).toEqual([]);
    },
  );

  it("cancels the order that could not be confirmed expired", async () => {
    const world = followingWorld();
    world.now = new Date("2026-10-09T12:03:00.000Z");
    world.orderReading = { kind: "unreachable" };

    await followMercadoPagoCharge(world.ports, INPUT);

    expect(await abandonMercadoPagoCharge(world.ports, INPUT)).toEqual({ kind: "cancelled" });
    expect(world.settledPayments).toEqual([]);
  });

  it("completes the sale once when the cancellation finds the order paid, and never again", async () => {
    const world = followingWorld();
    world.now = new Date("2026-10-09T12:03:00.000Z");
    world.orderReading = { kind: "unreachable" };
    world.orderCancellation = { kind: "answered", state: "APPROVED" };

    await followMercadoPagoCharge(world.ports, INPUT);
    const abandoned = await abandonMercadoPagoCharge(world.ports, INPUT);
    const followed = await followMercadoPagoCharge(world.ports, INPUT);
    const abandonedAgain = await abandonMercadoPagoCharge(world.ports, INPUT);

    expect(abandoned).toMatchObject({ kind: "already_paid" });
    expect(followed).toEqual({ kind: "not_pending" });
    expect(abandonedAgain).toEqual({ kind: "not_pending" });
    expect(world.settledPayments).toEqual([INPUT]);
  });
});
