import { describe, expect, it } from "vitest";
import { abandonMercadoPagoQrCharge } from "./abandon-mercado-pago-qr-charge.js";
import { confirmMercadoPagoOrderNotification } from "./confirm-mercado-pago-order-notification.js";
import { followMercadoPagoQrCharge } from "./follow-mercado-pago-qr-charge.js";
import {
  FakeMercadoPagoQrChargeWorld,
  QR_ACTOR_ID,
  QR_PAYMENT_ID,
  QR_SALE_ID,
} from "./test-support/mercado-pago-qr-charge-world.js";
import {
  mercadoPagoQrOrderWorld,
  paidOrderResult,
  REGISTER_ID,
  storedTransaction,
} from "./test-support/mercado-pago-qr-order-fixtures.js";

const INPUT = { actorId: QR_ACTOR_ID, paymentTransactionId: QR_PAYMENT_ID };
const AMOUNT = 5000;

describe("a QR payment the register could not confirm expired", () => {
  it("opens a refund task when Mercado Pago later reports the replaced payment paid", async () => {
    const register = new FakeMercadoPagoQrChargeWorld();
    register.seedPending();
    register.now = new Date("2026-10-09T12:03:00.000Z");
    register.orderReading = { kind: "unreachable" };
    register.orderCancellation = { kind: "unreachable" };

    expect(await followMercadoPagoQrCharge(register.ports, INPUT)).toEqual({
      kind: "expiry_unconfirmed",
    });
    expect(await abandonMercadoPagoQrCharge(register.ports, INPUT)).toEqual({ kind: "replaced" });
    expect(register.settledPayments).toEqual([]);

    const cloud = mercadoPagoQrOrderWorld({
      reading: { kind: "read", result: paidOrderResult(AMOUNT) },
    });
    cloud.lanes.seed(
      storedTransaction({
        id: QR_PAYMENT_ID,
        saleId: QR_SALE_ID,
        amount: AMOUNT,
        registerId: REGISTER_ID,
        providerOrderId: "order-1",
        replaced: register.charges.get(QR_PAYMENT_ID)?.replaced === true,
      }),
    );

    await confirmMercadoPagoOrderNotification(cloud.notificationPorts, {
      providerOrderId: "order-1",
    });

    expect([...cloud.lanes.latePaymentRefunds.values()].map(({ refund }) => refund)).toEqual([
      {
        paymentId: QR_PAYMENT_ID,
        method: "QR",
        provider: "MERCADOPAGO_QR",
        amount: AMOUNT,
        state: "PENDING",
        origin: "late_payment",
      },
    ]);
    expect(cloud.mercadoPago.cancellations).toEqual([]);
  });

  it("opens no task when the register's wait was never replaced and the payment is approved", async () => {
    const cloud = mercadoPagoQrOrderWorld({
      reading: { kind: "read", result: paidOrderResult(AMOUNT) },
    });
    cloud.lanes.seed(
      storedTransaction({
        id: QR_PAYMENT_ID,
        saleId: QR_SALE_ID,
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
