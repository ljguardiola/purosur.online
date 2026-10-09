import {
  cloudErrorSchema,
  type MercadoPagoQrOrderRequestBody,
  mercadoPagoQrPaymentSchema,
} from "@purosur/contracts";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installationRequestAttempts, paymentTransactions } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { insertRequestsUpToLimit } from "../sync/test-support/admitted-requests.js";
import { createMercadoPagoOrdersClient } from "./mercado-pago-orders-client.js";
import {
  createdOrder,
  ORDER_CARD_FIRST_SIX,
  ORDER_CARD_LAST_FOUR,
  paidWithCardOrder,
} from "./test-support/mercado-pago-documented-orders.js";
import {
  mercadoPagoQrRoutesUnderTest,
  NOW,
  ORDER_ID,
  PAID_ORDER,
} from "./test-support/mercado-pago-qr-under-test.js";

const route = mercadoPagoQrRoutesUnderTest();

function orderRequest(
  overrides: Partial<MercadoPagoQrOrderRequestBody> = {},
): MercadoPagoQrOrderRequestBody {
  return {
    payment_transaction_id: crypto.randomUUID(),
    sale_id: crypto.randomUUID(),
    amount: 5000,
    ...overrides,
  };
}

function enroll(registerName = "Caja 1") {
  return insertEnrolledInstallation(route.db, { now: NOW, registerName });
}

function createOrder(payload: unknown, authorization?: string) {
  return route.app.inject({
    method: "POST",
    url: "/payments/mercado-pago-qr/orders",
    payload: payload as object,
    ...(authorization !== undefined && { headers: { authorization } }),
  });
}

function readPayment(id: string, authorization?: string) {
  return route.app.inject({
    method: "GET",
    url: `/payments/mercado-pago-qr/${id}`,
    ...(authorization !== undefined && { headers: { authorization } }),
  });
}

function transactions() {
  return route.db.select().from(paymentTransactions);
}

const asks = [
  ["creating an order", (authorization?: string) => createOrder(orderRequest(), authorization)],
  [
    "reading a payment",
    (authorization?: string) => readPayment(crypto.randomUUID(), authorization),
  ],
] as const;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the Mercado Pago QR routes", () => {
  describe.each(asks)("who may ask, %s", (_name, ask) => {
    it("refuses a request that carries no device token", async () => {
      const response = await ask();

      expect(response.statusCode).toBe(401);
      expect(response.headers["www-authenticate"]).toBe("Bearer");
      expect(cloudErrorSchema.parse(response.json()).code).toBe("device_token_rejected");
      expect(route.mercadoPago.creations).toEqual([]);
      expect(route.mercadoPago.readings).toEqual([]);
      expect(await transactions()).toEqual([]);
    });

    it("refuses a device token no installation holds", async () => {
      const response = await ask("Bearer not-a-known-token");

      expect(response.statusCode).toBe(401);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("device_token_rejected");
    });

    it("refuses a revoked installation", async () => {
      const revoked = await insertEnrolledInstallation(route.db, {
        now: NOW,
        revokedAt: new Date(NOW.getTime() - 1_000),
      });

      const response = await ask(`Bearer ${revoked.deviceToken}`);

      expect(response.statusCode).toBe(403);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("revoked");
      expect(route.mercadoPago.creations).toEqual([]);
      expect(await transactions()).toEqual([]);
    });

    it("counts each admitted request as a payment order request of its installation", async () => {
      const { deviceId, deviceToken } = await enroll();

      await ask(`Bearer ${deviceToken}`);

      expect(
        await route.db
          .select({ endpoint: installationRequestAttempts.endpoint })
          .from(installationRequestAttempts)
          .where(eq(installationRequestAttempts.deviceId, deviceId)),
      ).toEqual([{ endpoint: "payment_order" }]);
    });

    it("refuses a request past the installation's limit with when to retry, before Mercado Pago is called", async () => {
      const { deviceId, deviceToken } = await enroll();
      await insertRequestsUpToLimit(
        route.db,
        deviceId,
        "payment_order",
        new Date(NOW.getTime() - 59 * 60 * 1000),
      );

      const response = await ask(`Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(429);
      expect(response.headers["retry-after"]).toBe("60");
      expect(cloudErrorSchema.parse(response.json()).code).toBe("rate_limited");
      expect(route.mercadoPago.creations).toEqual([]);
      expect(await transactions()).toEqual([]);
    });

    it("answers that the provider is not configured, recording nothing, once the installation is admitted", async () => {
      await route.serveWith(undefined);
      const { deviceToken } = await enroll();

      const response = await ask(`Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(503);
      expect(cloudErrorSchema.parse(response.json())).toMatchObject({
        code: "payment_provider_not_configured",
        retryable: false,
      });
      expect(await transactions()).toEqual([]);
    });

    it("asks for the device token before saying the provider is not configured", async () => {
      await route.serveWith(undefined);

      const response = await ask();

      expect(response.statusCode).toBe(401);
    });
  });

  describe("POST /payments/mercado-pago-qr/orders", () => {
    it("refuses an over-limit request before reading its body", async () => {
      const { deviceId, deviceToken } = await enroll();
      await insertRequestsUpToLimit(route.db, deviceId, "payment_order", NOW);

      const response = await createOrder({ amount: "fifty" }, `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(429);
    });

    it("answers that the provider is not configured before reading the body", async () => {
      await route.serveWith(undefined);
      const { deviceToken } = await enroll();

      const response = await createOrder({ amount: "fifty" }, `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(503);
    });

    it.each([
      ["a body that is not an order request", { amount: "fifty" }],
      ["an amount of zero", orderRequest({ amount: 0 })],
      ["an amount that is not whole cents", orderRequest({ amount: 12.5 })],
    ])("refuses %s, recording nothing and not calling Mercado Pago", async (_name, body) => {
      const { deviceToken } = await enroll();

      const response = await createOrder(body, `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(400);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("validation_failed");
      expect(route.mercadoPago.creations).toEqual([]);
      expect(await transactions()).toEqual([]);
    });

    it("creates the order of the installation's register and answers the pending payment", async () => {
      const { deviceToken, registerId } = await enroll();
      const body = orderRequest();

      const response = await createOrder(body, `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(200);
      expect(mercadoPagoQrPaymentSchema.parse(response.json())).toEqual({
        payment_transaction_id: body.payment_transaction_id,
        state: "PENDING",
        needs_review: false,
        amount: 5000,
        expires_at: "2026-10-09T12:05:00.000Z",
      });
      expect(route.mercadoPago.creations).toEqual([
        {
          idempotencyKey: body.payment_transaction_id,
          externalReference: body.payment_transaction_id,
          amount: 5000,
          expiresAfterMinutes: 5,
        },
      ]);
      expect(await transactions()).toMatchObject([
        {
          id: body.payment_transaction_id,
          registerId,
          saleId: body.sale_id,
          providerOrderId: ORDER_ID,
        },
      ]);
    });

    it("answers the approved payment when the order came back paid", async () => {
      route.mercadoPago.creation = { kind: "created", orderId: ORDER_ID, result: PAID_ORDER };
      const { deviceToken } = await enroll();

      const response = await createOrder(orderRequest(), `Bearer ${deviceToken}`);

      expect(mercadoPagoQrPaymentSchema.parse(response.json()).state).toBe("APPROVED");
    });

    it("answers the payment already recorded without creating a second order when asked again", async () => {
      const { deviceToken } = await enroll();
      const body = orderRequest();
      await createOrder(body, `Bearer ${deviceToken}`);

      const response = await createOrder(body, `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(200);
      expect(route.mercadoPago.creations).toHaveLength(1);
      expect(route.mercadoPago.readings).toEqual([ORDER_ID]);
      expect(await transactions()).toHaveLength(1);
    });

    it("answers a conflict when the transaction was recorded for another sale or amount", async () => {
      const { deviceToken } = await enroll();
      const body = orderRequest();
      await createOrder(body, `Bearer ${deviceToken}`);

      const response = await createOrder({ ...body, amount: 6000 }, `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(409);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("conflict");
      expect(await transactions()).toMatchObject([{ amount: 5000 }]);
    });

    it("answers not found for a transaction another register recorded, leaving it as it was", async () => {
      const owner = await enroll("Caja 1");
      const other = await enroll("Caja 2");
      const body = orderRequest();
      await createOrder(body, `Bearer ${owner.deviceToken}`);

      const response = await createOrder(body, `Bearer ${other.deviceToken}`);

      expect(response.statusCode).toBe(404);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("not_found");
      expect(await transactions()).toMatchObject([{ registerId: owner.registerId }]);
      expect(route.mercadoPago.creations).toHaveLength(1);
    });

    it("answers that the provider refused the order", async () => {
      route.mercadoPago.creation = { kind: "refused", code: "invalid_total_amount" };
      const { deviceToken } = await enroll();

      const response = await createOrder(orderRequest(), `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(502);
      expect(cloudErrorSchema.parse(response.json())).toMatchObject({
        code: "payment_provider_refused",
        retryable: false,
      });
      expect(JSON.stringify(response.json())).not.toContain("invalid_total_amount");
    });

    it("answers that the provider is unavailable, keeping the pending transaction to ask again", async () => {
      route.mercadoPago.creation = { kind: "unavailable" };
      const { deviceToken } = await enroll();

      const response = await createOrder(orderRequest(), `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(503);
      expect(cloudErrorSchema.parse(response.json())).toMatchObject({
        code: "payment_provider_unavailable",
        retryable: true,
      });
      expect(await transactions()).toMatchObject([{ state: "PENDING", providerOrderId: null }]);
    });
  });

  describe("GET /payments/mercado-pago-qr/:id", () => {
    it("refuses an identifier that is not a record id", async () => {
      const { deviceToken } = await enroll();

      const response = await readPayment("not-an-id", `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(400);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("validation_failed");
    });

    it("answers not found for a payment that was never recorded", async () => {
      const { deviceToken } = await enroll();

      const response = await readPayment(crypto.randomUUID(), `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(404);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("not_found");
    });

    it("answers not found for a payment another register recorded, without reading its order", async () => {
      const owner = await enroll("Caja 1");
      const other = await enroll("Caja 2");
      const body = orderRequest();
      await createOrder(body, `Bearer ${owner.deviceToken}`);
      route.mercadoPago.readings.length = 0;

      const response = await readPayment(
        body.payment_transaction_id,
        `Bearer ${other.deviceToken}`,
      );

      expect(response.statusCode).toBe(404);
      expect(route.mercadoPago.readings).toEqual([]);
    });

    it("reads the order and answers the payment in the state it is now", async () => {
      const { deviceToken } = await enroll();
      const body = orderRequest();
      await createOrder(body, `Bearer ${deviceToken}`);
      route.mercadoPago.reading = { kind: "read", result: PAID_ORDER };

      const response = await readPayment(body.payment_transaction_id, `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(200);
      expect(mercadoPagoQrPaymentSchema.parse(response.json())).toMatchObject({
        payment_transaction_id: body.payment_transaction_id,
        state: "APPROVED",
        needs_review: false,
      });
      expect(await transactions()).toMatchObject([{ state: "APPROVED" }]);
    });

    it("answers that the provider is unavailable when its order cannot be read", async () => {
      const { deviceToken } = await enroll();
      const body = orderRequest();
      await createOrder(body, `Bearer ${deviceToken}`);
      route.mercadoPago.reading = { kind: "unavailable" };

      const response = await readPayment(body.payment_transaction_id, `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(503);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("payment_provider_unavailable");
    });
  });

  describe("an order answer that carries card data", () => {
    const consoleMethods = ["log", "info", "warn", "error", "debug"] as const;

    function watchConsole() {
      const calls: unknown[][] = [];
      for (const method of consoleMethods) {
        vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
          calls.push(args);
        });
      }
      return calls;
    }

    it("stores and logs none of it, through the real client and the real database", async () => {
      const consoleCalls = watchConsole();
      const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) =>
        init?.method === "POST"
          ? new Response(JSON.stringify(createdOrder()), { status: 201 })
          : new Response(JSON.stringify(paidWithCardOrder()), { status: 200 }),
      );
      await route.serveWith(
        createMercadoPagoOrdersClient({
          accessToken: "APP_USR-fictional-access-token-0001",
          externalPosId: "STORE01POS01",
          fetch,
        }),
      );
      const { deviceToken } = await enroll();
      const body = orderRequest();

      const created = await createOrder(body, `Bearer ${deviceToken}`);
      const read = await readPayment(body.payment_transaction_id, `Bearer ${deviceToken}`);

      expect(created.statusCode).toBe(200);
      expect(read.statusCode).toBe(200);
      expect(mercadoPagoQrPaymentSchema.parse(read.json()).state).toBe("APPROVED");
      const everything = JSON.stringify([
        await transactions(),
        created.json(),
        read.json(),
        consoleCalls,
      ]);
      expect(everything).not.toContain(ORDER_CARD_FIRST_SIX);
      expect(everything).not.toContain(ORDER_CARD_LAST_FOUR);
      expect(consoleCalls).toEqual([]);
    });
  });
});
