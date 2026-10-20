import {
  cloudErrorSchema,
  type MercadoPagoCancellationRequestBody,
  type MercadoPagoOrderRequestBody,
  mercadoPagoCancellationSchema,
  mercadoPagoPaymentSchema,
} from "@purosur/contracts";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  installationRequestAttempts,
  paymentTransactions,
  registerPointTerminals,
  registerQrPointsOfSale,
} from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { insertRequestsUpToLimit } from "../sync/test-support/admitted-requests.js";
import { createMercadoPagoOrdersClient } from "./mercado-pago-orders-client.js";
import {
  AT_TERMINAL_ORDER,
  NOW,
  ORDER_ID,
  PAID_ORDER,
} from "./test-support/fake-mercado-pago-orders.js";
import {
  createdOrder,
  ORDER_CARD_FIRST_SIX,
  ORDER_CARD_LAST_FOUR,
  POINT_TERMINAL_ID,
  paidWithCardOrder,
  pointCreatedOrder,
  pointPaidWithCardOrder,
} from "./test-support/mercado-pago-documented-orders.js";
import { mercadoPagoOrderRoutesUnderTest } from "./test-support/mercado-pago-order-routes-under-test.js";

const route = mercadoPagoOrderRoutesUnderTest();

function orderRequest(
  overrides: Partial<MercadoPagoOrderRequestBody> = {},
): MercadoPagoOrderRequestBody {
  return {
    payment_transaction_id: crypto.randomUUID(),
    sale_id: crypto.randomUUID(),
    provider: "MERCADOPAGO_QR",
    amount: 5000,
    ...overrides,
  };
}

function qrPointOfSaleOf(registerName: string): string {
  return `${registerName.replace(/\s/gu, "_").toUpperCase()}_QR`;
}

async function enroll(registerName = "Caja 1", { withQrPointOfSale = true } = {}) {
  const installation = await insertEnrolledInstallation(route.db, { now: NOW, registerName });
  if (withQrPointOfSale) {
    await route.db.insert(registerQrPointsOfSale).values({
      registerId: installation.registerId,
      externalPosId: qrPointOfSaleOf(registerName),
      version: 1,
    });
  }
  return installation;
}

async function assignTerminal(registerId: string, terminalId: string) {
  await route.db.insert(registerPointTerminals).values({ registerId, terminalId, version: 1 });
}

function createOrder(payload: unknown, authorization?: string) {
  return route.app.inject({
    method: "POST",
    url: "/payments/mercado-pago/orders",
    payload: payload as object,
    ...(authorization !== undefined && { headers: { authorization } }),
  });
}

function readPayment(id: string, authorization?: string) {
  return route.app.inject({
    method: "GET",
    url: `/payments/mercado-pago/${id}`,
    ...(authorization !== undefined && { headers: { authorization } }),
  });
}

const CANCELLATION_REQUEST: MercadoPagoCancellationRequestBody = {
  sale_id: crypto.randomUUID(),
  provider: "MERCADOPAGO_QR",
  amount: 5000,
};

function cancelPayment(
  id: string,
  authorization?: string,
  payload: unknown = CANCELLATION_REQUEST,
) {
  return route.app.inject({
    method: "POST",
    url: `/payments/mercado-pago/${id}/cancel`,
    payload: payload as object,
    ...(authorization !== undefined && { headers: { authorization } }),
  });
}

function transactions() {
  return route.db.select().from(paymentTransactions);
}

const asks = [
  ["creating an order", (authorization?: string) => createOrder(orderRequest(), authorization)],
  [
    "cancelling a payment",
    (authorization?: string) => cancelPayment(crypto.randomUUID(), authorization),
  ],
  [
    "reading a payment",
    (authorization?: string) => readPayment(crypto.randomUUID(), authorization),
  ],
] as const;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the Mercado Pago order routes", () => {
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
      expect(cloudErrorSchema.parse(response.json()).code).toBe("payment_provider_not_configured");
      expect(await transactions()).toEqual([]);
    });

    it("asks for the device token before saying the provider is not configured", async () => {
      await route.serveWith(undefined);

      const response = await ask();

      expect(response.statusCode).toBe(401);
    });
  });

  describe("POST /payments/mercado-pago/orders", () => {
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
      expect(mercadoPagoPaymentSchema.parse(response.json())).toEqual({
        payment_transaction_id: body.payment_transaction_id,
        state: "PENDING",
        needs_review: false,
        provider: "MERCADOPAGO_QR",
        amount: 5000,
        expires_at: "2026-10-09T12:03:10.000Z",
      });
      expect(route.mercadoPago.creations).toEqual([
        {
          idempotencyKey: body.payment_transaction_id,
          externalReference: body.payment_transaction_id,
          amount: 5000,
          expiresAfterMinutes: 3,
          externalPosId: "CAJA_1_QR",
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

      expect(mercadoPagoPaymentSchema.parse(response.json()).state).toBe("APPROVED");
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

    it("sends each register's order to the QR point of sale assigned to that register", async () => {
      const first = await enroll("Caja 1");
      const second = await enroll("Caja 2");

      await createOrder(orderRequest(), `Bearer ${second.deviceToken}`);
      await createOrder(orderRequest(), `Bearer ${first.deviceToken}`);

      expect(route.mercadoPago.creations.map((order) => order.externalPosId)).toEqual([
        "CAJA_2_QR",
        "CAJA_1_QR",
      ]);
    });

    it("answers that the provider is not configured when the register has no QR point of sale, even if another register has one", async () => {
      await enroll("Caja 1");
      const { deviceToken } = await enroll("Caja 2", { withQrPointOfSale: false });

      const response = await createOrder(orderRequest(), `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(503);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("payment_provider_not_configured");
      expect(route.mercadoPago.creations).toEqual([]);
      expect(await transactions()).toEqual([]);
    });

    it("answers that the provider refused the order", async () => {
      route.mercadoPago.creation = { kind: "refused" };
      const { deviceToken } = await enroll();

      const response = await createOrder(orderRequest(), `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(502);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("payment_provider_refused");
    });

    it("answers that the provider is unavailable, keeping the pending transaction to ask again", async () => {
      route.mercadoPago.creation = { kind: "unavailable" };
      const { deviceToken } = await enroll();

      const response = await createOrder(orderRequest(), `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(503);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("payment_provider_unavailable");
      expect(await transactions()).toMatchObject([{ state: "PENDING", providerOrderId: null }]);
    });
  });

  describe("an order on the integrated terminal", () => {
    function pointOrderRequest(overrides: Partial<MercadoPagoOrderRequestBody> = {}) {
      return orderRequest({ provider: "MERCADOPAGO_POINT", amount: 5000, ...overrides });
    }

    it("creates the order on the terminal and answers the pending payment of that provider", async () => {
      const { deviceToken, registerId } = await enroll();
      await assignTerminal(registerId, POINT_TERMINAL_ID);
      const body = pointOrderRequest();

      const response = await createOrder(body, `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(200);
      expect(mercadoPagoPaymentSchema.parse(response.json())).toMatchObject({
        payment_transaction_id: body.payment_transaction_id,
        state: "PENDING",
        provider: "MERCADOPAGO_POINT",
        amount: 5000,
      });
      expect(route.mercadoPago.pointCreations).toEqual([
        {
          idempotencyKey: body.payment_transaction_id,
          externalReference: body.payment_transaction_id,
          amount: 5000,
          expiresAfterMinutes: 5,
          terminalId: POINT_TERMINAL_ID,
        },
      ]);
      expect(route.mercadoPago.creations).toEqual([]);
      expect(await transactions()).toMatchObject([
        {
          id: body.payment_transaction_id,
          registerId,
          method: "POINT",
          provider: "MERCADOPAGO_POINT",
          providerOrderId: ORDER_ID,
        },
      ]);
    });

    it("refuses an amount below the terminal's minimum, recording nothing and not calling Mercado Pago", async () => {
      const { deviceToken } = await enroll();

      const response = await createOrder(
        pointOrderRequest({ amount: 1499 }),
        `Bearer ${deviceToken}`,
      );

      expect(response.statusCode).toBe(400);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("validation_failed");
      expect(route.mercadoPago.pointCreations).toEqual([]);
      expect(await transactions()).toEqual([]);
    });

    it("sends each register's order to the terminal assigned to that register", async () => {
      const first = await enroll("Caja 1");
      const second = await enroll("Caja 2");
      await assignTerminal(first.registerId, "PAX_A910__SMARTPOS1");
      await assignTerminal(second.registerId, "PAX_A910__SMARTPOS2");

      await createOrder(pointOrderRequest(), `Bearer ${second.deviceToken}`);
      await createOrder(pointOrderRequest(), `Bearer ${first.deviceToken}`);

      expect(route.mercadoPago.pointCreations.map((order) => order.terminalId)).toEqual([
        "PAX_A910__SMARTPOS2",
        "PAX_A910__SMARTPOS1",
      ]);
    });

    it("answers that the provider is not configured when the register has no terminal, even if another register has one", async () => {
      const withTerminal = await enroll("Caja 1");
      await assignTerminal(withTerminal.registerId, POINT_TERMINAL_ID);
      const { deviceToken } = await enroll("Caja 2");

      const response = await createOrder(pointOrderRequest(), `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(503);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("payment_provider_not_configured");
      expect(route.mercadoPago.pointCreations).toEqual([]);
    });

    it.each([
      ["refused", { kind: "refused" }, 502, "payment_provider_refused"],
      ["unavailable", { kind: "unavailable" }, 503, "payment_provider_unavailable"],
    ] as const)("answers that the provider is %s", async (_name, creation, status, code) => {
      route.mercadoPago.pointCreation = creation;
      const { deviceToken, registerId } = await enroll();
      await assignTerminal(registerId, POINT_TERMINAL_ID);

      const response = await createOrder(pointOrderRequest(), `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(status);
      expect(cloudErrorSchema.parse(response.json()).code).toBe(code);
    });

    it("answers the payment still pending while the order is at the terminal", async () => {
      const { deviceToken, registerId } = await enroll();
      await assignTerminal(registerId, POINT_TERMINAL_ID);
      const body = pointOrderRequest();
      await createOrder(body, `Bearer ${deviceToken}`);
      route.mercadoPago.reading = { kind: "read", result: AT_TERMINAL_ORDER };

      const response = await readPayment(body.payment_transaction_id, `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(200);
      expect(mercadoPagoPaymentSchema.parse(response.json())).toMatchObject({
        state: "PENDING",
        provider: "MERCADOPAGO_POINT",
      });
    });

    it("cancels an order that is not at the terminal yet", async () => {
      const { deviceToken, registerId } = await enroll();
      await assignTerminal(registerId, POINT_TERMINAL_ID);
      const body = pointOrderRequest();
      await createOrder(body, `Bearer ${deviceToken}`);

      const response = await cancelPayment(body.payment_transaction_id, `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(200);
      expect(mercadoPagoCancellationSchema.parse(response.json())).toMatchObject({
        state: "CANCELLED",
        provider: "MERCADOPAGO_POINT",
        cancel_on_terminal: false,
      });
    });

    it("answers that the order can only be cancelled on the terminal once it is there", async () => {
      const { deviceToken, registerId } = await enroll();
      await assignTerminal(registerId, POINT_TERMINAL_ID);
      const body = pointOrderRequest();
      await createOrder(body, `Bearer ${deviceToken}`);
      route.mercadoPago.cancellation = { kind: "cannot_cancel" };
      route.mercadoPago.reading = { kind: "read", result: AT_TERMINAL_ORDER };

      const response = await cancelPayment(body.payment_transaction_id, `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(200);
      expect(mercadoPagoCancellationSchema.parse(response.json())).toMatchObject({
        payment_transaction_id: body.payment_transaction_id,
        state: "PENDING",
        provider: "MERCADOPAGO_POINT",
        cancel_on_terminal: true,
      });
      expect(await transactions()).toMatchObject([{ state: "PENDING" }]);
    });
  });

  describe("GET /payments/mercado-pago/:id", () => {
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
      expect(mercadoPagoPaymentSchema.parse(response.json())).toMatchObject({
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

  describe("POST /payments/mercado-pago/:id/cancel", () => {
    async function pendingPayment(deviceToken: string) {
      const body = orderRequest();
      await createOrder(body, `Bearer ${deviceToken}`);
      return body.payment_transaction_id;
    }

    it("refuses an identifier that is not a record id", async () => {
      const { deviceToken } = await enroll();

      const response = await cancelPayment("not-an-id", `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(400);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("validation_failed");
    });

    it("refuses a request without the payment's sale, provider and amount", async () => {
      const { deviceToken } = await enroll();

      const response = await cancelPayment(crypto.randomUUID(), `Bearer ${deviceToken}`, {});

      expect(response.statusCode).toBe(400);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("validation_failed");
      expect(await transactions()).toEqual([]);
    });

    it("answers cancelled for a payment it never recorded, keeping it cancelled without asking Mercado Pago", async () => {
      const { deviceToken } = await enroll();
      const id = crypto.randomUUID();

      const response = await cancelPayment(id, `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(200);
      expect(mercadoPagoCancellationSchema.parse(response.json())).toMatchObject({
        payment_transaction_id: id,
        state: "CANCELLED",
        provider: "MERCADOPAGO_QR",
        amount: 5000,
        cancel_on_terminal: false,
      });
      expect(await transactions()).toMatchObject([
        { id, saleId: CANCELLATION_REQUEST.sale_id, state: "CANCELLED", providerOrderId: null },
      ]);
      expect(route.mercadoPago.cancellations).toEqual([]);
      expect(route.mercadoPago.creations).toEqual([]);
    });

    it("answers not found for a payment another register recorded, without cancelling its order", async () => {
      const owner = await enroll("Caja 1");
      const other = await enroll("Caja 2");
      const id = await pendingPayment(owner.deviceToken);

      const response = await cancelPayment(id, `Bearer ${other.deviceToken}`);

      expect(response.statusCode).toBe(404);
      expect(route.mercadoPago.cancellations).toEqual([]);
      expect(await transactions()).toMatchObject([{ state: "PENDING" }]);
    });

    it("cancels the order and answers the cancelled payment", async () => {
      const { deviceToken } = await enroll();
      const id = await pendingPayment(deviceToken);

      const response = await cancelPayment(id, `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(200);
      expect(mercadoPagoCancellationSchema.parse(response.json())).toMatchObject({
        payment_transaction_id: id,
        state: "CANCELLED",
        needs_review: false,
        cancel_on_terminal: false,
      });
      const [cancellation] = route.mercadoPago.cancellations;
      expect(cancellation?.orderId).toBe(ORDER_ID);
      expect(cancellation?.idempotencyKey).toHaveLength(36);
      expect(cancellation?.idempotencyKey).not.toBe(id);
      expect(await transactions()).toMatchObject([{ state: "CANCELLED" }]);
    });

    it("answers the approved payment when the customer already paid", async () => {
      const { deviceToken } = await enroll();
      const id = await pendingPayment(deviceToken);
      route.mercadoPago.reading = { kind: "read", result: PAID_ORDER };

      const response = await cancelPayment(id, `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(200);
      expect(mercadoPagoPaymentSchema.parse(response.json())).toMatchObject({
        state: "APPROVED",
      });
      expect(route.mercadoPago.cancellations).toEqual([]);
    });

    it("answers that the provider is unavailable, leaving the payment pending to ask again", async () => {
      const { deviceToken } = await enroll();
      const id = await pendingPayment(deviceToken);
      route.mercadoPago.cancellation = { kind: "unavailable" };

      const response = await cancelPayment(id, `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(503);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("payment_provider_unavailable");
      expect(await transactions()).toMatchObject([{ state: "PENDING" }]);
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
          fetch,
        }),
      );
      const { deviceToken } = await enroll();
      const body = orderRequest();

      const created = await createOrder(body, `Bearer ${deviceToken}`);
      const read = await readPayment(body.payment_transaction_id, `Bearer ${deviceToken}`);

      expect(created.statusCode).toBe(200);
      expect(read.statusCode).toBe(200);
      expect(mercadoPagoPaymentSchema.parse(read.json()).state).toBe("APPROVED");
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

  describe("an order answer on the terminal that carries card data", () => {
    const consoleMethods = ["log", "info", "warn", "error", "debug"] as const;

    it("stores and logs none of it, through the real client and the real database", async () => {
      const consoleCalls: unknown[][] = [];
      for (const method of consoleMethods) {
        vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
          consoleCalls.push(args);
        });
      }
      const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) =>
        init?.method === "POST"
          ? new Response(JSON.stringify(pointCreatedOrder("50.00")), { status: 201 })
          : new Response(JSON.stringify(pointPaidWithCardOrder("50.00")), { status: 200 }),
      );
      await route.serveWith(
        createMercadoPagoOrdersClient({
          accessToken: "APP_USR-fictional-access-token-0001",
          fetch,
        }),
      );
      const { deviceToken, registerId } = await enroll();
      await assignTerminal(registerId, POINT_TERMINAL_ID);
      const body = orderRequest({ provider: "MERCADOPAGO_POINT" });

      const created = await createOrder(body, `Bearer ${deviceToken}`);
      const read = await readPayment(body.payment_transaction_id, `Bearer ${deviceToken}`);

      expect(created.statusCode).toBe(200);
      expect(read.statusCode).toBe(200);
      expect(mercadoPagoPaymentSchema.parse(read.json()).state).toBe("APPROVED");
      const everything = JSON.stringify([
        await transactions(),
        created.json(),
        read.json(),
        consoleCalls,
      ]);
      expect(everything).not.toContain(ORDER_CARD_FIRST_SIX);
      expect(everything).not.toContain(ORDER_CARD_LAST_FOUR);
      expect(everything).not.toContain("credit_card");
      expect(consoleCalls).toEqual([]);
    });
  });
});
