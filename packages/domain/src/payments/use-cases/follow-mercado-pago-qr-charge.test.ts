import { describe, expect, it } from "vitest";
import { abandonMercadoPagoQrCharge } from "./abandon-mercado-pago-qr-charge.js";
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

  it("answers that no charge is pending for a payment marked as replaced, asking the cloud nothing", async () => {
    const world = followingWorld();
    world.replacePendingPayment({
      actorId: QR_ACTOR_ID,
      paymentTransactionId: QR_PAYMENT_ID,
      replacedAt: world.now,
    });

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

  it("keeps waiting with no seconds left, leaving the payment pending, once the countdown ends and Mercado Pago still reports the order pending", async () => {
    const world = followingWorld();
    world.now = new Date("2026-10-09T12:03:00.000Z");

    expect(await followMercadoPagoQrCharge(world.ports, INPUT)).toEqual({
      kind: "waiting",
      remainingSeconds: 0,
    });
    expect(world.readOrders).toEqual([QR_PAYMENT_ID]);
    expect(world.pendingCharge(QR_PAYMENT_ID)).not.toBeNull();
  });

  it("answers the wait is over, recording the payment expired, once Mercado Pago reports the order expired", async () => {
    const world = followingWorld();
    world.now = new Date("2026-10-09T12:03:00.000Z");
    world.orderReading = { kind: "read", state: "EXPIRED" };

    expect(await followMercadoPagoQrCharge(world.ports, INPUT)).toEqual({ kind: "wait_over" });
    expect(world.operations).toEqual(["readOrder", "recordEnded:EXPIRED"]);
    expect(world.pendingCharge(QR_PAYMENT_ID)).toBeNull();
    expect(world.settledPayments).toEqual([]);
  });

  it("answers the wait is over when Mercado Pago expires the order before the countdown ends", async () => {
    const world = followingWorld();
    world.orderReading = { kind: "read", state: "EXPIRED" };

    expect(await followMercadoPagoQrCharge(world.ports, INPUT)).toEqual({ kind: "wait_over" });
  });

  it("cannot confirm the expiry when the order cannot be read after the countdown ended, leaving the payment pending", async () => {
    const world = followingWorld();
    world.now = new Date("2026-10-09T12:03:00.000Z");
    world.orderReading = { kind: "unreachable" };

    expect(await followMercadoPagoQrCharge(world.ports, INPUT)).toEqual({
      kind: "expiry_unconfirmed",
    });
    expect(world.pendingCharge(QR_PAYMENT_ID)).not.toBeNull();
    expect(world.operations).toEqual(["readOrder"]);
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

  it("settles a payment approved after the countdown ended but before Mercado Pago expired the order", async () => {
    const world = followingWorld();
    world.now = new Date("2026-10-09T12:03:05.000Z");
    world.orderReading = { kind: "read", state: "APPROVED" };

    expect(await followMercadoPagoQrCharge(world.ports, INPUT)).toMatchObject({
      kind: "approved",
    });
    expect(world.settledPayments).toEqual([INPUT]);
  });

  it("settles a payment approved in the wait's last second", async () => {
    const world = followingWorld();
    world.now = new Date("2026-10-09T12:02:59.999Z");
    world.orderReading = { kind: "read", state: "APPROVED" };

    expect(await followMercadoPagoQrCharge(world.ports, INPUT)).toMatchObject({
      kind: "approved",
    });
  });

  it.each(["DECLINED", "CANCELLED"] as const)(
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

describe("a Mercado Pago QR charge followed and abandoned to its end", () => {
  it("completes the sale once when the customer pays after the countdown ended, and never again", async () => {
    const world = followingWorld();
    world.now = new Date("2026-10-09T12:03:05.000Z");
    world.scriptedReadings.push({ kind: "read", state: "APPROVED" });

    const first = await followMercadoPagoQrCharge(world.ports, INPUT);
    const second = await followMercadoPagoQrCharge(world.ports, INPUT);
    const abandoned = await abandonMercadoPagoQrCharge(world.ports, INPUT);

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
      await followMercadoPagoQrCharge(world.ports, INPUT),
      await followMercadoPagoQrCharge(world.ports, INPUT),
      await followMercadoPagoQrCharge(world.ports, INPUT),
    ];

    expect(outcomes).toEqual([
      { kind: "waiting", remainingSeconds: 0 },
      { kind: "wait_over" },
      { kind: "not_pending" },
    ]);
    expect(world.charges.get(QR_PAYMENT_ID)?.state).toBe("EXPIRED");
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

      expect(await followMercadoPagoQrCharge(world.ports, INPUT)).toEqual({
        kind: "expiry_unconfirmed",
      });
      expect(await abandonMercadoPagoQrCharge(world.ports, INPUT)).toEqual({ kind: "replaced" });
      expect(await followMercadoPagoQrCharge(world.ports, INPUT)).toEqual({ kind: "not_pending" });
      expect(world.settledPayments).toEqual([]);
    },
  );

  it("cancels the order that could not be confirmed expired", async () => {
    const world = followingWorld();
    world.now = new Date("2026-10-09T12:03:00.000Z");
    world.orderReading = { kind: "unreachable" };

    await followMercadoPagoQrCharge(world.ports, INPUT);

    expect(await abandonMercadoPagoQrCharge(world.ports, INPUT)).toEqual({ kind: "cancelled" });
    expect(world.settledPayments).toEqual([]);
  });

  it("completes the sale once when the cancellation finds the order paid, and never again", async () => {
    const world = followingWorld();
    world.now = new Date("2026-10-09T12:03:00.000Z");
    world.orderReading = { kind: "unreachable" };
    world.orderCancellation = { kind: "answered", state: "APPROVED" };

    await followMercadoPagoQrCharge(world.ports, INPUT);
    const abandoned = await abandonMercadoPagoQrCharge(world.ports, INPUT);
    const followed = await followMercadoPagoQrCharge(world.ports, INPUT);
    const abandonedAgain = await abandonMercadoPagoQrCharge(world.ports, INPUT);

    expect(abandoned).toMatchObject({ kind: "already_paid" });
    expect(followed).toEqual({ kind: "not_pending" });
    expect(abandonedAgain).toEqual({ kind: "not_pending" });
    expect(world.settledPayments).toEqual([INPUT]);
  });
});
