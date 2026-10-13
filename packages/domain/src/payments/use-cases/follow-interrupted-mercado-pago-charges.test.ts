import { describe, expect, it } from "vitest";
import { followInterruptedMercadoPagoCharges } from "./follow-interrupted-mercado-pago-charges.js";
import {
  CHARGE_ACTOR_ID,
  CHARGE_NOW,
  CHARGE_PAYMENT_ID,
  CHARGE_SALE_ID,
  FakeMercadoPagoChargeWorld,
} from "./test-support/mercado-pago-charge-world.js";

const OTHER_PAYMENT_ID = "019a0000-0000-7000-8000-0000000000a2";
const OTHER_SALE_ID = "019a0000-0000-7000-8000-0000000000b2";
const OTHER_ACTOR_ID = "019a0000-0000-7000-8000-0000000000c2";
const RUN = { runStartedAt: CHARGE_NOW };

function worldWithPendingCharge(): FakeMercadoPagoChargeWorld {
  const world = new FakeMercadoPagoChargeWorld();
  world.seedPending();
  return world;
}

describe("followInterruptedMercadoPagoCharges", () => {
  it("asks the cloud nothing when no charge was left pending", async () => {
    const world = new FakeMercadoPagoChargeWorld();

    expect(await followInterruptedMercadoPagoCharges(world.ports, RUN)).toEqual({
      followed: [],
      failures: [],
    });
    expect(world.operations).toEqual([]);
  });

  it("settles a charge the cloud reports approved, for the person it was made for", async () => {
    const world = new FakeMercadoPagoChargeWorld();
    world.seedPending({}, OTHER_ACTOR_ID);
    world.orderReading = { kind: "read", state: "APPROVED" };

    const result = await followInterruptedMercadoPagoCharges(world.ports, RUN);

    expect(world.settledPayments).toEqual([
      { actorId: OTHER_ACTOR_ID, paymentTransactionId: CHARGE_PAYMENT_ID },
    ]);
    expect(result.followed).toEqual([
      {
        paymentTransactionId: CHARGE_PAYMENT_ID,
        outcome: { kind: "approved", settlement: world.settlement },
      },
    ]);
  });

  it("never settles an approved charge twice when it runs again", async () => {
    const world = worldWithPendingCharge();
    world.orderReading = { kind: "read", state: "APPROVED" };

    await followInterruptedMercadoPagoCharges(world.ports, RUN);
    const second = await followInterruptedMercadoPagoCharges(world.ports, RUN);

    expect(world.settledPayments).toHaveLength(1);
    expect(second.followed).toEqual([]);
  });

  it("records a charge the cloud reports ended, leaving it no longer pending", async () => {
    const world = worldWithPendingCharge();
    world.orderReading = { kind: "read", state: "DECLINED" };

    const result = await followInterruptedMercadoPagoCharges(world.ports, RUN);

    expect(world.operations).toEqual(["readOrder", "recordEnded:DECLINED"]);
    expect(result.followed).toEqual([
      { paymentTransactionId: CHARGE_PAYMENT_ID, outcome: { kind: "declined" } },
    ]);
    expect(world.pendingCharge(CHARGE_PAYMENT_ID)).toBeNull();
  });

  it("leaves the charge pending, settling and recording nothing, while the cloud cannot be reached", async () => {
    const world = worldWithPendingCharge();
    world.orderReading = { kind: "unreachable" };

    await followInterruptedMercadoPagoCharges(world.ports, RUN);

    expect(world.operations).toEqual(["readOrder"]);
    expect(world.pendingCharge(CHARGE_PAYMENT_ID)).not.toBeNull();
    expect(world.settledPayments).toEqual([]);
  });

  it("follows every pending charge, each for the person it was made for", async () => {
    const world = worldWithPendingCharge();
    world.seedPending(
      { paymentTransactionId: OTHER_PAYMENT_ID, saleId: OTHER_SALE_ID, method: "POINT" },
      OTHER_ACTOR_ID,
    );
    world.orderReading = { kind: "read", state: "APPROVED" };

    await followInterruptedMercadoPagoCharges(world.ports, RUN);

    expect(world.settledPayments).toEqual([
      { actorId: CHARGE_ACTOR_ID, paymentTransactionId: CHARGE_PAYMENT_ID },
      { actorId: OTHER_ACTOR_ID, paymentTransactionId: OTHER_PAYMENT_ID },
    ]);
  });

  it("does not follow a charge recorded once this run had started", async () => {
    const world = new FakeMercadoPagoChargeWorld();
    world.seedPending({}, CHARGE_ACTOR_ID, CHARGE_NOW);
    world.orderReading = { kind: "read", state: "APPROVED" };

    const result = await followInterruptedMercadoPagoCharges(world.ports, RUN);

    expect(world.readOrders).toEqual([]);
    expect(result).toEqual({ followed: [], failures: [] });
  });

  it("does not follow a charge replaced by another", async () => {
    const world = worldWithPendingCharge();
    world.replacePendingPayment({
      actorId: CHARGE_ACTOR_ID,
      paymentTransactionId: CHARGE_PAYMENT_ID,
      replacedAt: world.now,
    });

    await followInterruptedMercadoPagoCharges(world.ports, RUN);

    expect(world.readOrders).toEqual([]);
  });

  it("goes on with the other charges when one fails, reporting the failure", async () => {
    const world = worldWithPendingCharge();
    world.seedPending({ paymentTransactionId: OTHER_PAYMENT_ID, saleId: OTHER_SALE_ID });
    world.unreadableOrders.add(CHARGE_PAYMENT_ID);
    world.orderReading = { kind: "read", state: "APPROVED" };

    const result = await followInterruptedMercadoPagoCharges(world.ports, RUN);

    expect(world.settledPayments).toEqual([
      { actorId: CHARGE_ACTOR_ID, paymentTransactionId: OTHER_PAYMENT_ID },
    ]);
    expect(result.followed.map(({ paymentTransactionId }) => paymentTransactionId)).toEqual([
      OTHER_PAYMENT_ID,
    ]);
    expect(result.failures).toEqual([
      {
        paymentTransactionId: CHARGE_PAYMENT_ID,
        error: new Error(`order ${CHARGE_PAYMENT_ID} could not be read`),
      },
    ]);
  });

  it("follows each charge after the previous one finished", async () => {
    const world = worldWithPendingCharge();
    world.seedPending({ paymentTransactionId: OTHER_PAYMENT_ID, saleId: CHARGE_SALE_ID });
    world.orderReading = { kind: "read", state: "EXPIRED" };

    await followInterruptedMercadoPagoCharges(world.ports, RUN);

    expect(world.operations).toEqual([
      "readOrder",
      "recordEnded:EXPIRED",
      "readOrder",
      "recordEnded:EXPIRED",
    ]);
  });
});
