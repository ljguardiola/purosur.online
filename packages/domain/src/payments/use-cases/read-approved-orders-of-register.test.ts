import { describe, expect, it } from "vitest";
import { readApprovedOrdersOfRegister } from "./read-approved-orders-of-register.js";
import { FakeApprovedOrdersOfRegister } from "./test-support/fake-approved-orders-of-register.js";
import { FakePaymentTransactionLanes } from "./test-support/fake-payment-transaction-lanes.js";
import { FixedClock } from "./test-support/fake-refund-store.js";
import {
  NOW,
  REGISTER_ID,
  SALE_ID,
  storedPointTransaction,
  storedTransaction,
} from "./test-support/mercado-pago-order-fixtures.js";

function world() {
  const lanes = new FakePaymentTransactionLanes();
  const ports = { orders: new FakeApprovedOrdersOfRegister(lanes), clock: new FixedClock(NOW) };
  return { lanes, ports };
}

function hoursBeforeNow(hours: number): Date {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000);
}

describe("readApprovedOrdersOfRegister", () => {
  it("answers the register's approved orders with what the register needs to find its own", async () => {
    const { lanes, ports } = world();
    lanes.seed(
      storedTransaction({ id: "paid-qr", state: "APPROVED", createdAt: hoursBeforeNow(1) }),
    );

    expect(await readApprovedOrdersOfRegister(ports, { registerId: REGISTER_ID })).toEqual({
      kind: "read",
      orders: [
        {
          paymentTransactionId: "paid-qr",
          saleId: SALE_ID,
          method: "QR",
          provider: "MERCADOPAGO_QR",
          amount: 2500,
          createdAt: hoursBeforeNow(1),
        },
      ],
    });
  });

  it("includes an approved Point order", async () => {
    const { lanes, ports } = world();
    lanes.seed(
      storedPointTransaction({ id: "paid-point", state: "APPROVED", createdAt: hoursBeforeNow(2) }),
    );

    const outcome = await readApprovedOrdersOfRegister(ports, { registerId: REGISTER_ID });

    expect(outcome.orders.map((order) => [order.paymentTransactionId, order.method])).toEqual([
      ["paid-point", "POINT"],
    ]);
  });

  it("leaves out orders that are not approved", async () => {
    const { lanes, ports } = world();
    for (const state of ["PENDING", "DECLINED", "CANCELLED", "EXPIRED"] as const) {
      lanes.seed(storedTransaction({ id: state, state, createdAt: hoursBeforeNow(1) }));
    }

    expect(await readApprovedOrdersOfRegister(ports, { registerId: REGISTER_ID })).toEqual({
      kind: "read",
      orders: [],
    });
  });

  it("leaves out an approved order another order replaced", async () => {
    const { lanes, ports } = world();
    lanes.seed(
      storedTransaction({ state: "APPROVED", replaced: true, createdAt: hoursBeforeNow(1) }),
    );

    expect((await readApprovedOrdersOfRegister(ports, { registerId: REGISTER_ID })).orders).toEqual(
      [],
    );
  });

  it("leaves out the orders of another register", async () => {
    const { lanes, ports } = world();
    lanes.seed(
      storedTransaction({
        state: "APPROVED",
        registerId: "register-2",
        createdAt: hoursBeforeNow(1),
      }),
    );

    expect((await readApprovedOrdersOfRegister(ports, { registerId: REGISTER_ID })).orders).toEqual(
      [],
    );
  });

  it("reads back 72 hours from the clock, the limit included", async () => {
    const { lanes, ports } = world();
    lanes.seed(
      storedTransaction({ id: "at-limit", state: "APPROVED", createdAt: hoursBeforeNow(72) }),
    );
    lanes.seed(
      storedTransaction({
        id: "just-before",
        state: "APPROVED",
        createdAt: new Date(hoursBeforeNow(72).getTime() - 1),
      }),
    );

    const outcome = await readApprovedOrdersOfRegister(ports, { registerId: REGISTER_ID });

    expect(outcome.orders.map((order) => order.paymentTransactionId)).toEqual(["at-limit"]);
  });
});
