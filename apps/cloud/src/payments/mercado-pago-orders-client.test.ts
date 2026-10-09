import type { MercadoPagoOrderResult } from "@purosur/domain";
import type { MercadoPagoQrOrderRequest } from "@purosur/domain/payments/use-cases";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMercadoPagoOrdersClient } from "./mercado-pago-orders-client.js";
import {
  canceledOrder,
  createdOrder,
  expiredOrder,
  failedOrder,
  ORDER_CARD_FIRST_SIX,
  ORDER_CARD_LAST_FOUR,
  ORDER_ID,
  paidOrder,
  paidWithCardOrder,
  paidWithDiscountOrder,
} from "./test-support/mercado-pago-documented-orders.js";

const ACCESS_TOKEN = "APP_USR-fictional-access-token-0001";
const EXTERNAL_POS_ID = "STORE01POS01";

const REQUEST: MercadoPagoQrOrderRequest = {
  idempotencyKey: "0b0a5a42-1f9a-4a53-9f55-3e1c1c0d7a10",
  externalReference: "0b0a5a42-1f9a-4a53-9f55-3e1c1c0d7a10",
  amount: 5000,
  expiresAfterMinutes: 5,
};

function answer(status: number, body: unknown): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
}

function clientAnswering(...responses: (Response | Error)[]) {
  const queue = [...responses];
  const fetch = vi.fn<typeof globalThis.fetch>(async () => {
    const next = queue.shift();
    if (next === undefined) {
      throw new Error("test setup: no answer left");
    }
    if (next instanceof Error) {
      throw next;
    }
    return next;
  });
  const client = createMercadoPagoOrdersClient({
    accessToken: ACCESS_TOKEN,
    externalPosId: EXTERNAL_POS_ID,
    fetch,
  });
  return { client, fetch };
}

function sentRequest(fetch: ReturnType<typeof clientAnswering>["fetch"], call = 0) {
  const [url, init] = fetch.mock.calls[call] ?? [];
  return { url, init: init as RequestInit };
}

const consoleMethods = ["log", "info", "warn", "error", "debug"] as const;
let consoleCalls: unknown[][];

beforeEach(() => {
  consoleCalls = [];
  for (const method of consoleMethods) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      consoleCalls.push(args);
    });
  }
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function createdResult(overrides: Partial<MercadoPagoOrderResult> = {}): MercadoPagoOrderResult {
  return {
    status: "created",
    statusDetail: "created",
    totalAmount: 5000,
    totalPaidAmount: null,
    payments: [{ status: "created", statusDetail: "ready_to_process", paidAmount: null }],
    ...overrides,
  };
}

describe("the Mercado Pago orders client", () => {
  describe("creating a QR order", () => {
    it("posts the order of the store's static QR code with the idempotency key and the amount in pesos", async () => {
      const { client, fetch } = clientAnswering(answer(201, createdOrder()));

      await client.createQrOrder(REQUEST);

      const { url, init } = sentRequest(fetch);
      expect(url).toBe("https://api.mercadopago.com/v1/orders");
      expect(init.method).toBe("POST");
      expect(init.headers).toEqual({
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": REQUEST.idempotencyKey,
      });
      expect(JSON.parse(init.body as string)).toEqual({
        type: "qr",
        total_amount: "50.00",
        external_reference: REQUEST.externalReference,
        expiration_time: "PT5M",
        config: { qr: { external_pos_id: EXTERNAL_POS_ID, mode: "static" } },
        transactions: { payments: [{ amount: "50.00" }] },
      });
    });

    it("sends the same body and the same key every time it is asked for the same order", async () => {
      const { client, fetch } = clientAnswering(
        answer(201, createdOrder()),
        answer(201, createdOrder()),
      );

      await client.createQrOrder(REQUEST);
      await client.createQrOrder({ ...REQUEST });

      const first = sentRequest(fetch, 0).init;
      const second = sentRequest(fetch, 1).init;
      expect(second.body).toBe(first.body);
      expect(second.headers).toEqual(first.headers);
    });

    it.each([
      [1, "0.01"],
      [5, "0.05"],
      [100, "1.00"],
      [115, "1.15"],
      [435, "4.35"],
      [123_456_789, "1234567.89"],
    ])("writes %i cents as %s pesos", async (cents, pesos) => {
      const { client, fetch } = clientAnswering(answer(201, createdOrder(pesos)));

      await client.createQrOrder({ ...REQUEST, amount: cents });

      const body = JSON.parse(sentRequest(fetch).init.body as string);
      expect(body.total_amount).toBe(pesos);
      expect(body.transactions.payments).toEqual([{ amount: pesos }]);
    });

    it("answers the order that was created with its identifier and its state in the payment vocabulary", async () => {
      const { client } = clientAnswering(answer(201, createdOrder()));

      const creation = await client.createQrOrder(REQUEST);

      expect(creation).toStrictEqual({
        kind: "created",
        orderId: ORDER_ID,
        result: createdResult(),
      });
    });

    it("answers an order that already came back paid with the amount paid", async () => {
      const { client } = clientAnswering(answer(200, paidOrder()));

      const creation = await client.createQrOrder(REQUEST);

      expect(creation).toStrictEqual({
        kind: "created",
        orderId: ORDER_ID,
        result: {
          status: "processed",
          statusDetail: "accredited",
          totalAmount: 5000,
          totalPaidAmount: 5000,
          payments: [{ status: "processed", statusDetail: "accredited", paidAmount: 5000 }],
        },
      });
    });

    it.each([
      ["a missing identifier", { ...createdOrder(), id: undefined }],
      ["a missing status", { ...createdOrder(), status: undefined }],
      ["an amount that is not a decimal number", { ...createdOrder(), total_amount: "abc" }],
      ["an amount of three decimals", { ...createdOrder(), total_amount: "50.001" }],
      ["a negative amount", { ...createdOrder(), total_amount: "-50.00" }],
      ["an amount paid that is not a decimal number", { ...paidOrder(), total_paid_amount: "x" }],
    ])("cannot tell what became of the order when the answer has %s", async (_name, body) => {
      const { client } = clientAnswering(answer(201, body));

      expect(await client.createQrOrder(REQUEST)).toStrictEqual({ kind: "unavailable" });
    });

    it("cannot tell what became of the order when the answer is not JSON", async () => {
      const { client } = clientAnswering(answer(201, "<html>bad gateway</html>"));

      expect(await client.createQrOrder(REQUEST)).toStrictEqual({ kind: "unavailable" });
    });

    it("refuses with the code Mercado Pago gives in its error list", async () => {
      const { client } = clientAnswering(
        answer(400, { errors: [{ code: "invalid_total_amount", message: "bad amount" }] }),
      );

      expect(await client.createQrOrder(REQUEST)).toStrictEqual({
        kind: "refused",
        code: "invalid_total_amount",
      });
    });

    it("refuses with the code Mercado Pago gives at the top of its answer", async () => {
      const { client } = clientAnswering(answer(409, { code: "idempotency_key_already_used" }));

      expect(await client.createQrOrder(REQUEST)).toStrictEqual({
        kind: "refused",
        code: "idempotency_key_already_used",
      });
    });

    it("refuses with the status when Mercado Pago gives no usable code", async () => {
      const { client } = clientAnswering(answer(401, "Unauthorized"), answer(400, { code: "a b" }));

      expect(await client.createQrOrder(REQUEST)).toStrictEqual({
        kind: "refused",
        code: "http_401",
      });
      expect(await client.createQrOrder(REQUEST)).toStrictEqual({
        kind: "refused",
        code: "http_400",
      });
    });

    it.each([408, 429, 500, 502, 503])(
      "is unavailable when Mercado Pago answers %i",
      async (status) => {
        const { client } = clientAnswering(answer(status, { errors: [{ code: "later" }] }));

        expect(await client.createQrOrder(REQUEST)).toStrictEqual({ kind: "unavailable" });
      },
    );

    it("is unavailable when the network fails", async () => {
      const { client } = clientAnswering(new TypeError("fetch failed"));

      expect(await client.createQrOrder(REQUEST)).toStrictEqual({ kind: "unavailable" });
    });

    it("is unavailable when Mercado Pago does not answer within 10 seconds", async () => {
      vi.useFakeTimers();
      const fetch = vi.fn<typeof globalThis.fetch>(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
          }),
      );
      const client = createMercadoPagoOrdersClient({
        accessToken: ACCESS_TOKEN,
        externalPosId: EXTERNAL_POS_ID,
        fetch,
      });

      const creation = client.createQrOrder(REQUEST);
      await vi.advanceTimersByTimeAsync(9_999);
      expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);

      expect(await creation).toStrictEqual({ kind: "unavailable" });
    });
  });

  describe("reading an order", () => {
    it("gets the order by its identifier with the access token", async () => {
      const { client, fetch } = clientAnswering(answer(200, createdOrder()));

      await client.readOrder(ORDER_ID);

      const { url, init } = sentRequest(fetch);
      expect(url).toBe(`https://api.mercadopago.com/v1/orders/${ORDER_ID}`);
      expect(init.method).toBe("GET");
      expect(init.headers).toEqual({ Authorization: `Bearer ${ACCESS_TOKEN}` });
      expect(init.body).toBeUndefined();
    });

    it("does not let an identifier change the path it is read from", async () => {
      const { client, fetch } = clientAnswering(answer(200, createdOrder()));

      await client.readOrder("../payments/1?x=y");

      expect(sentRequest(fetch).url).toBe(
        "https://api.mercadopago.com/v1/orders/..%2Fpayments%2F1%3Fx%3Dy",
      );
    });

    it.each([
      ["created", createdOrder(), createdResult()],
      [
        "paid exactly",
        paidOrder(),
        {
          status: "processed",
          statusDetail: "accredited",
          totalAmount: 5000,
          totalPaidAmount: 5000,
          payments: [{ status: "processed", statusDetail: "accredited", paidAmount: 5000 }],
        },
      ],
      [
        "paid with a discount",
        paidWithDiscountOrder(),
        {
          status: "processed",
          statusDetail: "accredited",
          totalAmount: 5000,
          totalPaidAmount: 4728,
          payments: [{ status: "processed", statusDetail: "accredited", paidAmount: 4728 }],
        },
      ],
      [
        "canceled",
        canceledOrder(),
        createdResult({
          status: "canceled",
          statusDetail: "canceled",
          payments: [{ status: "canceled", statusDetail: "canceled_by_api", paidAmount: null }],
        }),
      ],
      [
        "expired",
        expiredOrder(),
        createdResult({
          status: "expired",
          statusDetail: "expired",
          payments: [{ status: "expired", statusDetail: "expired", paidAmount: null }],
        }),
      ],
      [
        "failed",
        failedOrder(),
        createdResult({
          status: "failed",
          statusDetail: "failed",
          payments: [{ status: "failed", statusDetail: "rejected_by_issuer", paidAmount: null }],
        }),
      ],
    ])(
      "translates an order that is %s into the payment vocabulary",
      async (_name, body, result) => {
        const { client } = clientAnswering(answer(200, body));

        expect(await client.readOrder(ORDER_ID)).toStrictEqual({ kind: "read", result });
      },
    );

    it("reads the amounts in cents without the drift of floating point numbers", async () => {
      const { client } = clientAnswering(
        answer(200, paidWithDiscountOrder("4.35", "1.15")),
        answer(200, paidWithDiscountOrder("0.29", "0.07")),
      );

      expect(await client.readOrder(ORDER_ID)).toMatchObject({
        result: { totalAmount: 435, totalPaidAmount: 115 },
      });
      expect(await client.readOrder(ORDER_ID)).toMatchObject({
        result: { totalAmount: 29, totalPaidAmount: 7 },
      });
    });

    it("reads an amount with one decimal and an amount without decimals", async () => {
      const { client } = clientAnswering(answer(200, paidWithDiscountOrder("50", "47.5")));

      expect(await client.readOrder(ORDER_ID)).toMatchObject({
        result: { totalAmount: 5000, totalPaidAmount: 4750 },
      });
    });

    it("keeps nothing the payment says about the payer or the card", async () => {
      const { client } = clientAnswering(answer(200, paidWithCardOrder()));

      const reading = await client.readOrder(ORDER_ID);

      const serialized = JSON.stringify(reading);
      expect(serialized).not.toContain(ORDER_CARD_FIRST_SIX);
      expect(serialized).not.toContain(ORDER_CARD_LAST_FOUR);
      expect(serialized).not.toContain("credit_card");
      expect(reading).toStrictEqual({
        kind: "read",
        result: {
          status: "processed",
          statusDetail: "accredited",
          totalAmount: 5000,
          totalPaidAmount: 5000,
          payments: [{ status: "processed", statusDetail: "accredited", paidAmount: 5000 }],
        },
      });
    });

    it.each([
      ["a missing status detail", { ...createdOrder(), status_detail: undefined }],
      ["a missing total amount", { ...createdOrder(), total_amount: undefined }],
      ["a payment without its status", { ...createdOrder(), transactions: { payments: [{}] } }],
      [
        "a payment amount paid that is not a decimal number",
        {
          ...createdOrder(),
          transactions: {
            payments: [{ status: "processed", status_detail: "accredited", paid_amount: "1,5" }],
          },
        },
      ],
    ])("is unavailable when the answer has %s", async (_name, body) => {
      const { client } = clientAnswering(answer(200, body));

      expect(await client.readOrder(ORDER_ID)).toStrictEqual({ kind: "unavailable" });
    });

    it.each([400, 401, 404, 429, 500, 503])(
      "is unavailable when Mercado Pago answers %i",
      async (status) => {
        const { client } = clientAnswering(answer(status, { errors: [{ code: "nope" }] }));

        expect(await client.readOrder(ORDER_ID)).toStrictEqual({ kind: "unavailable" });
      },
    );

    it("is unavailable when the network fails or the answer is not JSON", async () => {
      const { client } = clientAnswering(new TypeError("fetch failed"), answer(200, "not json"));

      expect(await client.readOrder(ORDER_ID)).toStrictEqual({ kind: "unavailable" });
      expect(await client.readOrder(ORDER_ID)).toStrictEqual({ kind: "unavailable" });
    });

    it("is unavailable when Mercado Pago does not answer within 10 seconds", async () => {
      vi.useFakeTimers();
      const fetch = vi.fn<typeof globalThis.fetch>(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
          }),
      );
      const client = createMercadoPagoOrdersClient({
        accessToken: ACCESS_TOKEN,
        externalPosId: EXTERNAL_POS_ID,
        fetch,
      });

      const reading = client.readOrder(ORDER_ID);
      await vi.advanceTimersByTimeAsync(10_000);

      expect(await reading).toStrictEqual({ kind: "unavailable" });
    });
  });

  describe("the access token", () => {
    const failures: [string, () => Response | Error][] = [
      ["a refusal that echoes the token", () => answer(401, { code: ACCESS_TOKEN })],
      [
        "a refusal with an error list that echoes the token",
        () => answer(400, { errors: [{ code: ACCESS_TOKEN, message: ACCESS_TOKEN }] }),
      ],
      ["a server error", () => answer(500, { message: ACCESS_TOKEN })],
      [
        "a network failure that carries the request",
        () => new TypeError(`fetch failed ${ACCESS_TOKEN}`),
      ],
      ["an answer that is not JSON", () => answer(200, ACCESS_TOKEN)],
      ["an answer missing its fields", () => answer(200, { message: ACCESS_TOKEN })],
    ];

    it.each(failures)(
      "is never logged and never returned on %s, creating",
      async (_name, failure) => {
        const { client } = clientAnswering(failure());

        const creation = await client.createQrOrder(REQUEST);

        expect(JSON.stringify(creation)).not.toContain(ACCESS_TOKEN);
        expect(JSON.stringify(consoleCalls)).not.toContain(ACCESS_TOKEN);
      },
    );

    it.each(failures)(
      "is never logged and never returned on %s, reading",
      async (_name, failure) => {
        const { client } = clientAnswering(failure());

        const reading = await client.readOrder(ORDER_ID);

        expect(JSON.stringify(reading)).not.toContain(ACCESS_TOKEN);
        expect(JSON.stringify(consoleCalls)).not.toContain(ACCESS_TOKEN);
      },
    );

    it("is never logged when a request succeeds", async () => {
      const { client } = clientAnswering(
        answer(201, createdOrder()),
        answer(200, paidWithCardOrder()),
      );

      await client.createQrOrder(REQUEST);
      await client.readOrder(ORDER_ID);

      expect(consoleCalls).toEqual([]);
    });

    it("is never logged when the request times out", async () => {
      vi.useFakeTimers();
      const fetch = vi.fn<typeof globalThis.fetch>(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
          }),
      );
      const client = createMercadoPagoOrdersClient({
        accessToken: ACCESS_TOKEN,
        externalPosId: EXTERNAL_POS_ID,
        fetch,
      });

      const creation = client.createQrOrder(REQUEST);
      await vi.advanceTimersByTimeAsync(10_000);

      expect(JSON.stringify(await creation)).not.toContain(ACCESS_TOKEN);
      expect(JSON.stringify(consoleCalls)).not.toContain(ACCESS_TOKEN);
    });
  });
});
