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

function recordedWaitEnd(waitEndsAt: Date): string {
  return ["recordWaitEnd", waitEndsAt.toISOString()].join(":");
}

const INPUT = {
  actorId: CHARGE_ACTOR_ID,
  saleId: CHARGE_SALE_ID,
  method: "QR",
  amount: 5000,
} as const;

describe("startMercadoPagoCharge", () => {
  it("keeps the pending payment, with the end of its 3-minute wait, before asking the cloud for the order", async () => {
    const world = new FakeMercadoPagoChargeWorld();

    await startMercadoPagoCharge(world.ports, INPUT);

    expect(world.recordedPayments).toEqual([
      { ...INPUT, occurredAt: CHARGE_NOW, waitEndsAt: CHARGE_WAIT_ENDS_AT },
    ]);
    expect(world.operations).toEqual([
      "recordPendingPayment",
      "requestOrder",
      recordedWaitEnd(CHARGE_WAIT_ENDS_AT),
    ]);
  });

  it("asks the cloud for an order of the pending payment's id, sale and amount", async () => {
    const world = new FakeMercadoPagoChargeWorld();

    await startMercadoPagoCharge(world.ports, INPUT);

    expect(world.requestedOrders).toEqual([
      {
        paymentTransactionId: CHARGE_PAYMENT_ID,
        saleId: CHARGE_SALE_ID,
        method: "QR",
        amount: 5000,
      },
    ]);
  });

  it("shows the order with the amount and the wait left once the cloud creates it", async () => {
    const world = new FakeMercadoPagoChargeWorld();

    expect(await startMercadoPagoCharge(world.ports, INPUT)).toEqual({
      kind: "order_shown",
      paymentTransactionId: CHARGE_PAYMENT_ID,
      amount: 5000,
      remainingSeconds: 180,
      waitSeconds: 180,
    });
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

  it.each([
    { answer: { kind: "refused" }, outcome: { kind: "order_refused" } },
    { answer: { kind: "unreachable" }, outcome: { kind: "unreachable" } },
  ] as const)(
    "answers $outcome.kind when the cloud's answer is $answer.kind, keeping the payment pending, since the order may exist, with its wait ended when the cloud answered",
    async ({ answer, outcome }) => {
      const world = new FakeMercadoPagoChargeWorld();
      const answeredAt = new Date("2026-10-09T12:00:04.000Z");
      world.requestOrder = async () => {
        world.operations.push("requestOrder");
        world.now = answeredAt;
        return answer;
      };

      expect(await startMercadoPagoCharge(world.ports, INPUT)).toEqual(outcome);
      expect(world.pendingCharge(CHARGE_PAYMENT_ID)?.waitEndsAt).toEqual(answeredAt);
      expect(world.operations).toEqual([
        "recordPendingPayment",
        "requestOrder",
        `recordWaitEnd:${answeredAt.toISOString()}`,
      ]);
    },
  );

  it("ends the wait when the cloud says the order expires, whenever that is", async () => {
    const world = new FakeMercadoPagoChargeWorld();
    const expiresAt = new Date("2026-10-09T12:03:10.000Z");
    world.orderAnswer = { kind: "created", expiresAt };

    expect(await startMercadoPagoCharge(world.ports, INPUT)).toMatchObject({
      kind: "order_shown",
      remainingSeconds: 190,
    });
    expect(world.pendingCharge(CHARGE_PAYMENT_ID)?.waitEndsAt).toEqual(expiresAt);
    expect(world.operations).toEqual([
      "recordPendingPayment",
      "requestOrder",
      `recordWaitEnd:${expiresAt.toISOString()}`,
    ]);
  });

  it("counts the time the cloud took against the wait that ends at the order's expiry", async () => {
    const world = new FakeMercadoPagoChargeWorld();
    world.requestOrder = async () => {
      world.now = new Date("2026-10-09T12:00:02.000Z");
      return { kind: "created", expiresAt: new Date("2026-10-09T12:03:10.000Z") };
    };

    expect(await startMercadoPagoCharge(world.ports, INPUT)).toMatchObject({
      remainingSeconds: 188,
    });
  });

  it("shows no time left when the order the cloud created has already expired", async () => {
    const world = new FakeMercadoPagoChargeWorld();
    world.orderAnswer = { kind: "created", expiresAt: new Date("2026-10-08T12:00:00.000Z") };

    expect(await startMercadoPagoCharge(world.ports, INPUT)).toMatchObject({
      remainingSeconds: 0,
    });
  });
});
