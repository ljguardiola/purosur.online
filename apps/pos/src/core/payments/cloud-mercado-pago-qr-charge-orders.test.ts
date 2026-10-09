import { cloudError } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import type { CloudCallOptions, CloudResponse } from "../platform/cloud-client";
import { CloudMercadoPagoQrChargeOrders } from "./cloud-mercado-pago-qr-charge-orders";

const PAYMENT_ID = "019a0000-0000-7000-8000-0000000000a1";
const SALE_ID = "019a0000-0000-7000-8000-0000000000b1";
const ORDER = { paymentTransactionId: PAYMENT_ID, saleId: SALE_ID, amount: 5000 };
const START = new Date("2026-10-09T12:00:00.000Z");

interface Call {
  method: "POST" | "GET";
  path: string;
  bearerToken: string;
  body?: unknown;
  options?: CloudCallOptions;
}

function payment(state: string, overrides: Record<string, unknown> = {}) {
  return {
    payment_transaction_id: PAYMENT_ID,
    state,
    needs_review: false,
    amount: 5000,
    expires_at: "2026-10-09T12:05:10.000Z",
    ...overrides,
  };
}

function ok(body: unknown): CloudResponse {
  return { kind: "ok", body };
}

function refused(code: Parameters<typeof cloudError>[0]): CloudResponse {
  return { kind: "error", error: cloudError(code, "x") };
}

function cloudOrders(answers: CloudResponse[], token: string | null = "prefix.secret") {
  const calls: Call[] = [];
  let now = START;
  const answerOf = () => answers.shift() ?? { kind: "unreachable" };
  const orders = new CloudMercadoPagoQrChargeOrders({
    readDeviceToken: async () => token ?? undefined,
    post: async (path, bearerToken, body) => {
      calls.push({ method: "POST", path, bearerToken, body });
      return answerOf();
    },
    get: async (path, bearerToken, options) => {
      calls.push({ method: "GET", path, bearerToken, options });
      return answerOf();
    },
    now: () => now,
  });
  return {
    calls,
    orders,
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
  };
}

describe("asking the cloud for a Mercado Pago QR order", () => {
  it("posts the payment's id, sale and amount with the device token", async () => {
    const { calls, orders } = cloudOrders([ok(payment("PENDING"))]);

    await orders.requestOrder(ORDER);

    expect(calls).toEqual([
      {
        method: "POST",
        path: "/api/payments/mercado-pago-qr/orders",
        bearerToken: "prefix.secret",
        body: { payment_transaction_id: PAYMENT_ID, sale_id: SALE_ID, amount: 5000 },
      },
    ]);
  });

  it("answers created when the cloud answers with the payment", async () => {
    const { orders } = cloudOrders([ok(payment("PENDING"))]);

    expect(await orders.requestOrder(ORDER)).toEqual({ kind: "created" });
  });

  it.each([
    "validation_failed",
    "device_token_rejected",
    "revoked",
    "not_found",
    "conflict",
    "payment_provider_refused",
    "payment_provider_not_configured",
  ] as const)("answers refused when the cloud refuses with %s", async (code) => {
    const { orders } = cloudOrders([refused(code)]);

    expect(await orders.requestOrder(ORDER)).toEqual({ kind: "refused" });
  });

  it.each(["rate_limited", "server_unavailable", "payment_provider_unavailable"] as const)(
    "answers unreachable when the cloud is still answering %s",
    async (code) => {
      const { orders } = cloudOrders([refused(code)]);

      expect(await orders.requestOrder(ORDER)).toEqual({ kind: "unreachable" });
    },
  );

  it("answers unreachable when the cloud cannot be reached or its answer is not a payment", async () => {
    const { orders } = cloudOrders([{ kind: "unreachable" }, ok({ state: "PENDING" })]);

    expect(await orders.requestOrder(ORDER)).toEqual({ kind: "unreachable" });
    expect(await orders.requestOrder(ORDER)).toEqual({ kind: "unreachable" });
  });

  it("asks nothing and answers refused while the register holds no device token", async () => {
    const { calls, orders } = cloudOrders([], null);

    expect(await orders.requestOrder(ORDER)).toEqual({ kind: "refused" });
    expect(calls).toEqual([]);
  });
});

describe("reading a Mercado Pago QR order's state from the cloud", () => {
  it("gets the payment with the device token, once, within the time between two checks", async () => {
    const { calls, orders } = cloudOrders([ok(payment("PENDING"))]);

    await orders.readOrder(PAYMENT_ID);

    expect(calls).toEqual([
      {
        method: "GET",
        path: `/api/payments/mercado-pago-qr/${PAYMENT_ID}`,
        bearerToken: "prefix.secret",
        options: { timeoutMs: 3_000, singleAttempt: true },
      },
    ]);
  });

  it.each(["PENDING", "APPROVED", "DECLINED", "CANCELLED", "EXPIRED"] as const)(
    "answers the state %s the cloud reports",
    async (state) => {
      const { orders } = cloudOrders([ok(payment(state))]);

      expect(await orders.readOrder(PAYMENT_ID)).toEqual({ kind: "read", state });
    },
  );

  it("answers unreachable when the cloud refuses, cannot be reached or answers another payment", async () => {
    const { orders, advance } = cloudOrders([
      refused("server_unavailable"),
      { kind: "unreachable" },
      ok(payment("APPROVED", { payment_transaction_id: "019a0000-0000-7000-8000-0000000000ff" })),
    ]);

    expect(await orders.readOrder(PAYMENT_ID)).toEqual({ kind: "unreachable" });
    advance(3_000);
    expect(await orders.readOrder(PAYMENT_ID)).toEqual({ kind: "unreachable" });
    advance(3_000);
    expect(await orders.readOrder(PAYMENT_ID)).toEqual({ kind: "unreachable" });
  });

  it("asks the cloud at most once every 3 seconds, answering the last state read in between", async () => {
    const { calls, orders, advance } = cloudOrders([
      ok(payment("PENDING")),
      ok(payment("APPROVED")),
    ]);

    expect(await orders.readOrder(PAYMENT_ID)).toEqual({ kind: "read", state: "PENDING" });
    advance(2_999);
    expect(await orders.readOrder(PAYMENT_ID)).toEqual({ kind: "read", state: "PENDING" });
    expect(calls).toHaveLength(1);
    advance(1);
    expect(await orders.readOrder(PAYMENT_ID)).toEqual({ kind: "read", state: "APPROVED" });
    expect(calls).toHaveLength(2);
  });

  it("asks again within 3 seconds for another payment", async () => {
    const other = "019a0000-0000-7000-8000-0000000000a2";
    const { calls, orders } = cloudOrders([
      ok(payment("PENDING")),
      ok(payment("PENDING", { payment_transaction_id: other })),
    ]);

    await orders.readOrder(PAYMENT_ID);
    await orders.readOrder(other);

    expect(calls.map((call) => call.path)).toEqual([
      `/api/payments/mercado-pago-qr/${PAYMENT_ID}`,
      `/api/payments/mercado-pago-qr/${other}`,
    ]);
  });

  it("asks nothing and answers unreachable while the register holds no device token", async () => {
    const { calls, orders } = cloudOrders([], null);

    expect(await orders.readOrder(PAYMENT_ID)).toEqual({ kind: "unreachable" });
    expect(calls).toEqual([]);
  });
});
