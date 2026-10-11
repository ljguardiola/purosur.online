import { cloudErrorSchema } from "@purosur/contracts";
import { PAYMENT_NOTIFICATION_LIMIT } from "@purosur/domain";
import { FICTIONAL_CUIT, FICTIONAL_LEGAL_NAME } from "@purosur/domain/fiscal/test-support";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { paymentNotificationAttempts, paymentTransactions } from "../platform/db/schema.js";
import {
  NOW,
  ORDER_ID,
  PAID_ORDER,
  UNPAID_ORDER,
} from "./test-support/fake-mercado-pago-orders.js";
import {
  signatureHeader,
  WEBHOOK_SECRET,
} from "./test-support/mercado-pago-notification-signing.js";
import { mercadoPagoNotificationRoutesUnderTest } from "./test-support/mercado-pago-notifications-under-test.js";
import { insertRegister, pendingTransaction } from "./test-support/payment-transaction-fixtures.js";

const route = mercadoPagoNotificationRoutesUnderTest();

const NOT_AN_ORDER = "payment";

async function pendingPaymentOfOrder(
  providerOrderId = ORDER_ID,
  overrides: Parameters<typeof pendingTransaction>[1] = {},
) {
  const registerId = await insertRegister(route.db, "Caja 1");
  const transaction = pendingTransaction(registerId, { providerOrderId, ...overrides });
  await route.db.insert(paymentTransactions).values(transaction);
  return transaction;
}

function attemptsOf(sourceAddress: string) {
  return route.db
    .select()
    .from(paymentNotificationAttempts)
    .where(eq(paymentNotificationAttempts.sourceAddress, sourceAddress));
}

function reportedText(): string {
  return JSON.stringify(route.report.mock.calls, (_key, value: unknown) =>
    value instanceof Error ? value.message : value,
  );
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

  describe("signature of a notification other than an order", () => {
    it("counts a notification with an invalid signature, discards it and logs it, changing nothing", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      route.mercadoPago.reading = { kind: "read", result: PAID_ORDER };
      const payment = await pendingPaymentOfOrder();

      const response = await route.notify({ type: NOT_AN_ORDER, signature: "ts=1,v1=00" });

      expect(response.statusCode).toBe(401);
      expect(route.mercadoPago.readings).toEqual([]);
      expect(await stateOf(payment.id)).toBe("PENDING");
      expect(await attemptsOf("203.0.113.50")).toHaveLength(1);
      expect(warn).toHaveBeenCalledOnce();
    });

    it("logs why it discarded a malformed signature and the notification's type", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

      const response = await route.notify({ type: NOT_AN_ORDER, signature: "garbage" });

      expect(response.statusCode).toBe(401);
      expect(warn).toHaveBeenCalledExactlyOnceWith(
        "discarded a Mercado Pago notification with an invalid signature",
        { reason: "malformed_signature", type: NOT_AN_ORDER },
      );
    });

    it("logs, on a mismatch, what the manifest was built from and every manifest tried", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

      const response = await route.notify({
        type: NOT_AN_ORDER,
        signature: signatureHeader({ dataId: "ORD99OTHER" }),
        requestId: "8f2a6c1e-request",
      });

      expect(response.statusCode).toBe(401);
      expect(warn).toHaveBeenCalledExactlyOnceWith(
        "discarded a Mercado Pago notification with an invalid signature",
        {
          reason: "mismatch",
          type: NOT_AN_ORDER,
          dataId: ORDER_ID,
          dataIdSource: "query",
          ts: "1760011200000",
          requestId: "8f2a6c1e-request",
          manifests: [
            "id:ORD01JQ4S4KY8HWQ6NA5PXB65B3D3;request-id:8f2a6c1e-request;ts:1760011200000;",
            "id:ord01jq4s4ky8hwq6na5pxb65b3d3;request-id:8f2a6c1e-request;ts:1760011200000;",
          ],
        },
      );
    });

    it("logs, on a mismatch, the body's data id when it differs from the query's", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

      await route.notify({
        type: NOT_AN_ORDER,
        signature: signatureHeader({ dataId: "ORD99OTHER" }),
        body: { type: NOT_AN_ORDER, data: { id: "ORD01BODY" } },
      });

      expect(warn.mock.calls[0]?.[1]).toMatchObject({ dataId: ORDER_ID, bodyDataId: "ORD01BODY" });
    });

    it("logs, on a mismatch, neither the secret, the received signature nor any computed one", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const signature = signatureHeader({ dataId: "ORD99OTHER" });

      await route.notify({ type: NOT_AN_ORDER, signature });

      const logged = JSON.stringify(warn.mock.calls);
      const received = signature.split("v1=")[1] ?? "";
      const computed = [ORDER_ID, ORDER_ID.toLowerCase()].map(
        (dataId) => signatureHeader({ dataId }).split("v1=")[1] ?? "",
      );
      expect(received).toHaveLength(64);
      for (const secretPart of [WEBHOOK_SECRET, received, ...computed]) {
        expect(logged).not.toContain(secretPart);
      }
    });

    it("reports a discarded notification with its type and why, and nothing it was signed with or sent", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const signature = signatureHeader({ dataId: "ORD99OTHER" });

      await route.notify({
        type: NOT_AN_ORDER,
        signature,
        body: {
          type: NOT_AN_ORDER,
          data: { id: ORDER_ID },
          payer: { email: "payer@example.test", name: FICTIONAL_LEGAL_NAME, cuit: FICTIONAL_CUIT },
        },
      });

      expect(route.report).toHaveBeenCalledExactlyOnceWith(
        "payments: discarded a Mercado Pago notification with an invalid signature",
        new Error("discarded a Mercado Pago notification with an invalid signature"),
        { context: { type: NOT_AN_ORDER, reason: "mismatch" } },
      );
      const reported = reportedText();
      const [ts = "", received = ""] = signature.replace("ts=", "").split(",v1=");
      for (const sensitive of [
        WEBHOOK_SECRET,
        received,
        ts,
        ORDER_ID,
        "request-1",
        "payer@example.test",
        FICTIONAL_LEGAL_NAME,
        FICTIONAL_CUIT,
      ]) {
        expect(reported).not.toContain(sensitive);
      }
    });

    it("reports a discarded notification only the first time Mercado Pago sends it", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);

      await route.notify({ type: NOT_AN_ORDER, signature: "garbage" });
      await route.notify({ type: NOT_AN_ORDER, signature: "garbage" });
      await route.notify({ type: NOT_AN_ORDER, dataId: "ORD99OTHER", signature: "garbage" });

      expect(route.report).toHaveBeenCalledTimes(2);
      expect(route.report.mock.calls.map(([, , options]) => options?.context)).toEqual([
        { type: NOT_AN_ORDER, reason: "malformed_signature" },
        { type: NOT_AN_ORDER, reason: "malformed_signature" },
      ]);
    });

    it("refuses a notification with an invalid signature of an origin over the limit, telling when to retry", async () => {
      await route.db.insert(paymentNotificationAttempts).values(
        Array.from({ length: PAYMENT_NOTIFICATION_LIMIT }, () => ({
          sourceAddress: "203.0.113.50",
          attemptedAt: new Date(NOW.getTime() - 30_000),
        })),
      );

      const response = await route.notify({ type: NOT_AN_ORDER, signature: "ts=1,v1=00" });

      expect(response.statusCode).toBe(429);
      expect(response.headers["retry-after"]).toBe("30");
    });
  });

  describe.each([
    ["without a signature", undefined],
    ["with a signature that does not verify", signatureHeader({ dataId: "ORD99OTHER" })],
  ])("an order notification %s", (_name, signature) => {
    it("reads the order from Mercado Pago and approves our pending payment according to what it returns", async () => {
      route.mercadoPago.reading = { kind: "read", result: PAID_ORDER };
      const payment = await pendingPaymentOfOrder();

      const response = await route.notify({ signature });

      expect(response.statusCode).toBe(200);
      expect(route.mercadoPago.readings).toEqual([ORDER_ID]);
      expect(await stateOf(payment.id)).toBe("APPROVED");
      expect(route.report).not.toHaveBeenCalled();
    });

    it("leaves the payment pending when it claims the order was paid and Mercado Pago says it was not", async () => {
      route.mercadoPago.reading = { kind: "read", result: UNPAID_ORDER };
      const payment = await pendingPaymentOfOrder();

      const response = await route.notify({
        signature,
        body: { type: "order", status: "processed", data: { id: ORDER_ID, status: "processed" } },
      });

      expect(response.statusCode).toBe(200);
      expect(route.mercadoPago.readings).toEqual([ORDER_ID]);
      expect(await stateOf(payment.id)).toBe("PENDING");
    });

    it("answers 200 and reads nothing for an order no payment has", async () => {
      const response = await route.notify({ signature, dataId: "ORD99UNKNOWN" });

      expect(response.statusCode).toBe(200);
      expect(route.mercadoPago.readings).toEqual([]);
    });

    it("answers 200 and reads nothing for the order of a payment already resolved", async () => {
      route.mercadoPago.reading = { kind: "read", result: UNPAID_ORDER };
      const payment = await pendingPaymentOfOrder(ORDER_ID, { state: "APPROVED" });

      const response = await route.notify({ signature });

      expect(response.statusCode).toBe(200);
      expect(route.mercadoPago.readings).toEqual([]);
      expect(await stateOf(payment.id)).toBe("APPROVED");
    });

    it("answers 200 and reads nothing when it names no order", async () => {
      await pendingPaymentOfOrder();

      const response = await route.notify({ signature, dataId: undefined });

      expect(response.statusCode).toBe(200);
      expect(route.mercadoPago.readings).toEqual([]);
    });

    it("refuses it from an origin over the limit without reading the order, telling when to retry", async () => {
      await pendingPaymentOfOrder();
      await route.db.insert(paymentNotificationAttempts).values(
        Array.from({ length: PAYMENT_NOTIFICATION_LIMIT }, () => ({
          sourceAddress: "203.0.113.50",
          attemptedAt: new Date(NOW.getTime() - 30_000),
        })),
      );

      const response = await route.notify({ signature });

      expect(response.statusCode).toBe(429);
      expect(response.headers["retry-after"]).toBe("30");
      expect(route.mercadoPago.readings).toEqual([]);
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

  describe("an order it cannot read", () => {
    it("reports the order once, however many times Mercado Pago sends its notification again", async () => {
      route.mercadoPago.reading = { kind: "unavailable" };
      await pendingPaymentOfOrder();

      await route.notify();
      await route.notify();

      expect(route.report).toHaveBeenCalledExactlyOnceWith(
        "payments: a Mercado Pago order its notification named could not be read",
        new Error("a Mercado Pago order its notification named could not be read"),
        { context: { providerOrderId: ORDER_ID } },
      );
    });

    it("reports nothing for an order it read or no payment of ours has", async () => {
      route.mercadoPago.reading = { kind: "read", result: UNPAID_ORDER };
      await pendingPaymentOfOrder();

      await route.notify();
      await route.notify({ dataId: "ORD99UNKNOWN" });

      expect(route.report).not.toHaveBeenCalled();
    });
  });
});
