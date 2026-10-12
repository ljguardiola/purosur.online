import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { paymentTransactions } from "../platform/db/schema.js";
import { clientAnsweringOrder } from "./test-support/client-answering-order.js";
import { ORDER_ID } from "./test-support/fake-mercado-pago-orders.js";
import { pointPaidWithCardOrder } from "./test-support/mercado-pago-documented-orders.js";
import { WEBHOOK_SECRET } from "./test-support/mercado-pago-notification-signing.js";
import { mercadoPagoNotificationRoutesUnderTest } from "./test-support/mercado-pago-notifications-under-test.js";
import {
  insertRegister,
  pendingPointTransaction,
} from "./test-support/payment-transaction-fixtures.js";

const route = mercadoPagoNotificationRoutesUnderTest();

describe("a notification of an order on the integrated terminal", () => {
  it("approves the pending payment of an order paid on the terminal", async () => {
    await route.serveWith({
      mercadoPago: clientAnsweringOrder(pointPaidWithCardOrder()),
      webhookSecret: WEBHOOK_SECRET,
    });
    const registerId = await insertRegister(route.db, "Caja 1");
    const payment = pendingPointTransaction(registerId, { providerOrderId: ORDER_ID });
    await route.db.insert(paymentTransactions).values(payment);

    const response = await route.notify();

    expect(response.statusCode).toBe(200);
    const [row] = await route.db
      .select()
      .from(paymentTransactions)
      .where(eq(paymentTransactions.id, payment.id));
    expect(row).toMatchObject({
      state: "APPROVED",
      method: "POINT",
      provider: "MERCADOPAGO_POINT",
    });
  });
});
