import { describe, expect, it } from "vitest";
import { abandonMercadoPagoCharge } from "./abandon-mercado-pago-charge.js";
import { confirmMercadoPagoOrderNotification } from "./confirm-mercado-pago-order-notification.js";
import { followMercadoPagoCharge } from "./follow-mercado-pago-charge.js";
import {
  CHARGE_ACTOR_ID,
  CHARGE_PAYMENT_ID,
  CHARGE_SALE_ID,
  FakeMercadoPagoChargeWorld,
} from "./test-support/mercado-pago-charge-world.js";
import {
  mercadoPagoOrderWorld,
  paidOrderResult,
  REGISTER_ID,
  storedTransaction,
} from "./test-support/mercado-pago-order-fixtures.js";

const INPUT = { actorId: CHARGE_ACTOR_ID, paymentTransactionId: CHARGE_PAYMENT_ID };
const AMOUNT = 5000;

describe("a QR payment the register could not confirm expired", () => {
  it("opens a refund task when Mercado Pago later reports the replaced payment paid", async () => {
    const register = new FakeMercadoPagoChargeWorld();
    register.seedPending();
    register.now = new Date("2026-10-09T12:03:00.000Z");
    register.orderReading = { kind: "unreachable" };
    register.orderCancellation = { kind: "unreachable" };

    expect(await followMercadoPagoCharge(register.ports, INPUT)).toEqual({
      kind: "expiry_unconfirmed",
    });
    expect(await abandonMercadoPagoCharge(register.ports, INPUT)).toEqual({ kind: "replaced" });
    expect(register.settledPayments).toEqual([]);

    const cloud = mercadoPagoOrderWorld({
      reading: { kind: "read", result: paidOrderResult(AMOUNT) },
    });
    cloud.lanes.seed(
      storedTransaction({
        id: CHARGE_PAYMENT_ID,
        saleId: CHARGE_SALE_ID,
        amount: AMOUNT,
        registerId: REGISTER_ID,
        providerOrderId: "order-1",
        replaced: register.charges.get(CHARGE_PAYMENT_ID)?.replaced === true,
      }),
    );

    await confirmMercadoPagoOrderNotification(cloud.notificationPorts, {
      providerOrderId: "order-1",
    });

    expect([...cloud.lanes.latePaymentRefunds.values()].map(({ refund }) => refund)).toEqual([
      {
        paymentId: CHARGE_PAYMENT_ID,
        method: "QR",
        provider: "MERCADOPAGO_QR",
        amount: AMOUNT,
        state: "PENDING",
        origin: "late_payment",
        providerOrderId: null,
      },
    ]);
    expect(cloud.mercadoPago.cancellations).toEqual([]);
  });

  it("opens no task when the register's wait was never replaced and the payment is approved", async () => {
    const cloud = mercadoPagoOrderWorld({
      reading: { kind: "read", result: paidOrderResult(AMOUNT) },
    });
    cloud.lanes.seed(
      storedTransaction({
        id: CHARGE_PAYMENT_ID,
        saleId: CHARGE_SALE_ID,
        amount: AMOUNT,
        providerOrderId: "order-1",
      }),
    );

    await confirmMercadoPagoOrderNotification(cloud.notificationPorts, {
      providerOrderId: "order-1",
    });

    expect(cloud.lanes.latePaymentRefunds.size).toBe(0);
  });
});
