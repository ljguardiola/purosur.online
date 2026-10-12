import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { paymentTransactions } from "../platform/db/schema.js";
import { ORDER_ID } from "./test-support/fake-mercado-pago-orders.js";
import { WEBHOOK_SECRET } from "./test-support/mercado-pago-notification-signing.js";
import { mercadoPagoNotificationRoutesUnderTest } from "./test-support/mercado-pago-notifications-under-test.js";
import {
  insertRegister,
  pendingPointTransaction,
} from "./test-support/payment-transaction-fixtures.js";
import { clientAnsweringOrder, POINT_ORDER_STATES } from "./test-support/point-order-states.js";

const route = mercadoPagoNotificationRoutesUnderTest();

describe("a notification of an order on the integrated terminal", () => {
  it.each(POINT_ORDER_STATES)(
    "moves the pending payment of an order %s to its state",
    async (_name, order, state) => {
      await route.serveWith({
        mercadoPago: clientAnsweringOrder(order()),
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
      expect(row).toMatchObject({ state, method: "POINT", provider: "MERCADOPAGO_POINT" });
    },
  );
});
