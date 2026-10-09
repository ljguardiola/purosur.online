import { cloudErrorSchema } from "@purosur/contracts";
import { PAYMENT_NOTIFICATION_LIMIT } from "@purosur/domain";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { paymentNotificationAttempts, paymentTransactions } from "../platform/db/schema.js";
import {
  NOW,
  ORDER_ID,
  PAID_ORDER,
  UNPAID_ORDER,
} from "./test-support/fake-mercado-pago-orders.js";
import { WEBHOOK_SECRET } from "./test-support/mercado-pago-notification-signing.js";
import { mercadoPagoNotificationRoutesUnderTest } from "./test-support/mercado-pago-notifications-under-test.js";
import { insertRegister, pendingTransaction } from "./test-support/payment-transaction-fixtures.js";

const route = mercadoPagoNotificationRoutesUnderTest();

async function pendingPaymentOfOrder(providerOrderId = ORDER_ID) {
  const registerId = await insertRegister(route.db, "Caja 1");
  const transaction = pendingTransaction(registerId, { providerOrderId });
  await route.db.insert(paymentTransactions).values(transaction);
  return transaction;
}

function attemptsOf(sourceAddress: string) {
  return route.db
    .select()
    .from(paymentNotificationAttempts)
    .where(eq(paymentNotificationAttempts.sourceAddress, sourceAddress));
}

async function stateOf(id: string) {
  const [row] = await route.db
    .select()
    .from(paymentTransactions)
    .where(eq(paymentTransactions.id, id));
  return row?.state;
}

describe("POST /payments/mercado-pago/notifications", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("rate limit", () => {
    it("refuses a signed notification of an origin over the limit, telling when to retry", async () => {
      await route.db.insert(paymentNotificationAttempts).values(
        Array.from({ length: PAYMENT_NOTIFICATION_LIMIT }, () => ({
          sourceAddress: "203.0.113.50",
          attemptedAt: new Date(NOW.getTime() - 30_000),
        })),
      );

      const response = await route.notify();

      expect(response.statusCode).toBe(429);
      expect(response.headers["retry-after"]).toBe("30");
      expect(cloudErrorSchema.parse(response.json()).code).toBe("rate_limited");
      expect(route.mercadoPago.readings).toEqual([]);
    });

    it("counts the notifications of each origin on its own", async () => {
      await route.db.insert(paymentNotificationAttempts).values(
        Array.from({ length: PAYMENT_NOTIFICATION_LIMIT }, () => ({
          sourceAddress: "203.0.113.51",
          attemptedAt: new Date(NOW.getTime() - 30_000),
        })),
      );

      const response = await route.notify({ sourceAddress: "203.0.113.50" });

      expect(response.statusCode).toBe(200);
    });
  });

  describe("when Mercado Pago or its signing secret is not configured", () => {
    it("answers that the provider is not configured without the Mercado Pago orders", async () => {
      await route.serveWith({ webhookSecret: WEBHOOK_SECRET });
      const payment = await pendingPaymentOfOrder();

      const response = await route.notify();

      expect(response.statusCode).toBe(503);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("payment_provider_not_configured");
      expect(await stateOf(payment.id)).toBe("PENDING");
    });

    it("answers that the provider is not configured without the signing secret", async () => {
      await route.serveWith({ mercadoPago: route.mercadoPago });
      const payment = await pendingPaymentOfOrder();

      const response = await route.notify();

      expect(response.statusCode).toBe(503);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("payment_provider_not_configured");
      expect(route.mercadoPago.readings).toEqual([]);
      expect(await stateOf(payment.id)).toBe("PENDING");
      expect(await attemptsOf("203.0.113.50")).toEqual([]);
    });
  });

  describe("signature", () => {
    it("discards a notification with an invalid signature before counting it, logging it and changing nothing", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      route.mercadoPago.reading = { kind: "read", result: PAID_ORDER };
      const payment = await pendingPaymentOfOrder();

      const response = await route.notify({ signature: "ts=1,v1=00" });

      expect(response.statusCode).toBe(401);
      expect(route.mercadoPago.readings).toEqual([]);
      expect(await stateOf(payment.id)).toBe("PENDING");
      expect(await attemptsOf("203.0.113.50")).toEqual([]);
      expect(warn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("signature"));
    });
  });

  describe("a correctly signed notification", () => {
    it("reads the order from Mercado Pago and approves the payment according to what it returns", async () => {
      route.mercadoPago.reading = { kind: "read", result: PAID_ORDER };
      const payment = await pendingPaymentOfOrder();

      const response = await route.notify();

      expect(response.statusCode).toBe(200);
      expect(route.mercadoPago.readings).toEqual([ORDER_ID]);
      expect(await stateOf(payment.id)).toBe("APPROVED");
    });

    it("leaves the payment pending when the body claims it was paid and Mercado Pago says it was not", async () => {
      route.mercadoPago.reading = { kind: "read", result: UNPAID_ORDER };
      const payment = await pendingPaymentOfOrder();

      const response = await route.notify({
        body: { type: "order", status: "processed", data: { id: ORDER_ID, status: "processed" } },
      });

      expect(response.statusCode).toBe(200);
      expect(route.mercadoPago.readings).toEqual([ORDER_ID]);
      expect(await stateOf(payment.id)).toBe("PENDING");
    });

    it("answers 200 and reads nothing for an order no payment has", async () => {
      const response = await route.notify({ dataId: "ORD99UNKNOWN" });

      expect(response.statusCode).toBe(200);
      expect(route.mercadoPago.readings).toEqual([]);
    });

    it.each([
      ["another type", "payment"],
      ["no type", undefined],
    ])("answers 200 and ignores a notification of %s", async (_name, type) => {
      route.mercadoPago.reading = { kind: "read", result: PAID_ORDER };
      const payment = await pendingPaymentOfOrder();

      const response = await route.notify({ type });

      expect(response.statusCode).toBe(200);
      expect(route.mercadoPago.readings).toEqual([]);
      expect(await stateOf(payment.id)).toBe("PENDING");
    });

    it("answers that the provider is unavailable, so Mercado Pago sends it again, when the order cannot be read", async () => {
      route.mercadoPago.reading = { kind: "unavailable" };
      const payment = await pendingPaymentOfOrder();

      const response = await route.notify();

      expect(response.statusCode).toBe(503);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("payment_provider_unavailable");
      expect(await stateOf(payment.id)).toBe("PENDING");
    });
  });
});
