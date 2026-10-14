import { cloudError } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import type { CloudCallOptions, CloudResponse } from "../platform/cloud-client";
import { CloudPaidOrdersOfRegister } from "./cloud-paid-orders-of-register";

const PAYMENT_ID = "019a0000-0000-7000-8000-0000000000a1";
const SALE_ID = "019a0000-0000-7000-8000-0000000000b1";
const SINCE = new Date("2026-10-10T12:00:00.000Z");

interface Call {
  method: "POST" | "GET";
  path: string;
  bearerToken: string;
  options?: CloudCallOptions | undefined;
}

const APPROVED_ORDER = {
  payment_transaction_id: PAYMENT_ID,
  sale_id: SALE_ID,
  method: "QR",
  provider: "MERCADOPAGO_QR",
  amount: 2500,
  created_at: "2026-10-13T11:00:00.000Z",
};

function ok(body: unknown): CloudResponse {
  return { kind: "ok", body };
}

function refused(code: Parameters<typeof cloudError>[0]): CloudResponse {
  return { kind: "error", error: cloudError(code, "x") };
}

function cloudOrders(answers: CloudResponse[], token: string | null = "prefix.secret") {
  const calls: Call[] = [];
  const answerOf = () => answers.shift() ?? { kind: "unreachable" };
  const orders = new CloudPaidOrdersOfRegister({
    readDeviceToken: async () => token ?? undefined,
    post: async (path, bearerToken, _body, options) => {
      calls.push({ method: "POST", path, bearerToken, options });
      return answerOf();
    },
    get: async (path, bearerToken, options) => {
      calls.push({ method: "GET", path, bearerToken, options });
      return answerOf();
    },
  });
  return { calls, orders };
}

describe("asking the cloud for the approved orders of the register", () => {
  it("lists what the cloud answers, with the installation's token and no retry storm", async () => {
    const { calls, orders } = cloudOrders([ok({ orders: [APPROVED_ORDER] })]);

    expect(await orders.approvedSince(SINCE)).toEqual({
      kind: "listed",
      orders: [
        {
          paymentTransactionId: PAYMENT_ID,
          saleId: SALE_ID,
          method: "QR",
          provider: "MERCADOPAGO_QR",
          amount: 2500,
          createdAt: new Date("2026-10-13T11:00:00.000Z"),
        },
      ],
    });
    expect(calls).toEqual([
      {
        method: "GET",
        path: "/api/payments/mercado-pago/approved",
        bearerToken: "prefix.secret",
        options: { timeoutMs: expect.any(Number), singleAttempt: true },
      },
    ]);
  });

  it("lists nothing when the cloud has no approved order", async () => {
    const { orders } = cloudOrders([ok({ orders: [] })]);

    expect(await orders.approvedSince(SINCE)).toEqual({ kind: "listed", orders: [] });
  });

  it("keeps only the orders created since the moment asked, as the cloud's window may be wider", async () => {
    const older = {
      ...APPROVED_ORDER,
      payment_transaction_id: "019a0000-0000-7000-8000-0000000000a2",
      created_at: "2026-10-09T00:00:00.000Z",
    };
    const { orders } = cloudOrders([ok({ orders: [older, APPROVED_ORDER] })]);

    const answer = await orders.approvedSince(SINCE);

    expect(
      answer.kind === "listed" && answer.orders.map((order) => order.paymentTransactionId),
    ).toEqual([PAYMENT_ID]);
  });

  it.each([
    ["the cloud cannot be reached", { kind: "unreachable" } as CloudResponse],
    ["the cloud fails", refused("server_unavailable")],
    ["the cloud refuses the token", refused("device_token_rejected")],
    ["the answer is not a list of orders", ok({ orders: "none" })],
    ["the answer is not an object", ok(null)],
  ])("is unreachable when %s", async (_case, answer) => {
    const { orders } = cloudOrders([answer]);

    expect(await orders.approvedSince(SINCE)).toEqual({ kind: "unreachable" });
  });

  it("is unreachable, asking nothing, without a device token", async () => {
    const { calls, orders } = cloudOrders([ok({ orders: [] })], null);

    expect(await orders.approvedSince(SINCE)).toEqual({ kind: "unreachable" });
    expect(calls).toEqual([]);
  });
});

describe("asking the cloud to open the late payment refund of an order", () => {
  it.each(["opened", "already_open"] as const)("answers %s as the cloud says", async (opening) => {
    const { calls, orders } = cloudOrders([ok({ payment_transaction_id: PAYMENT_ID, opening })]);

    expect(await orders.openLatePaymentRefund(PAYMENT_ID)).toEqual({ kind: opening });
    expect(calls).toEqual([
      {
        method: "POST",
        path: `/api/payments/mercado-pago/${PAYMENT_ID}/late-payment-refund`,
        bearerToken: "prefix.secret",
        options: { timeoutMs: expect.any(Number), singleAttempt: true },
      },
    ]);
  });

  it.each([
    ["the payment is not the register's", refused("not_found")],
    ["the cloud refuses it as a conflict", refused("conflict")],
  ])("is refused when %s", async (_case, answer) => {
    const { orders } = cloudOrders([answer]);

    expect(await orders.openLatePaymentRefund(PAYMENT_ID)).toEqual({ kind: "refused" });
  });

  it.each([
    ["the cloud cannot be reached", { kind: "unreachable" } as CloudResponse],
    ["the cloud fails", refused("server_unavailable")],
    ["the cloud limits the requests", refused("rate_limited")],
    [
      "the answer is of another payment",
      ok({ payment_transaction_id: "019a0000-0000-7000-8000-0000000000a3", opening: "opened" }),
    ],
    ["the answer is not an opening", ok({ payment_transaction_id: PAYMENT_ID, opening: "later" })],
  ])("is unreachable when %s", async (_case, answer) => {
    const { orders } = cloudOrders([answer]);

    expect(await orders.openLatePaymentRefund(PAYMENT_ID)).toEqual({ kind: "unreachable" });
  });

  it("is unreachable, asking nothing, without a device token", async () => {
    const { calls, orders } = cloudOrders([], null);

    expect(await orders.openLatePaymentRefund(PAYMENT_ID)).toEqual({ kind: "unreachable" });
    expect(calls).toEqual([]);
  });
});
