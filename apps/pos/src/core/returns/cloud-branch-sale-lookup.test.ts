import { cloudError } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import type { CloudCallOptions, CloudResponse } from "../platform/cloud-client";
import { CloudBranchSaleLookup } from "./cloud-branch-sale-lookup";

const ANSWER = {
  sale: {
    id: "sale-1",
    register_id: "register-2",
    device_id: "device-2",
    session_id: "session-2",
    actor_id: "cashier",
    state: "COMPLETED",
    sale_discount: {
      kind: "AMOUNT",
      amount: 1500,
      reason: "cliente frecuente",
      authorized_by: null,
    },
    lines: [
      {
        id: "line-1",
        product_id: "yerba",
        product_name: "Yerba 1 kg",
        sale_unit: "UNIT",
        quantity: 3,
        promotion_id: null,
        line_total: 7500,
      },
    ],
  },
  occurred_at: "2026-09-12T18:30:00.000Z",
  invoice: { point_of_sale: 3, number: 1204 },
  payments: [
    {
      id: "pay-cash",
      method: "CASH",
      provider: "NONE",
      amount: 7500,
      state: "APPROVED",
      refunded_amount: 500,
    },
  ],
  returned: [{ sale_line_id: "line-1", quantity: 1, refunded_amount: 2500 }],
  good_condition_return_days: 15,
  counted_return_ids: ["return-1"],
};

interface Get {
  path: string;
  headers: Record<string, string>;
  options: CloudCallOptions;
}

function lookupWith(answer: CloudResponse, token: string | null = "prefix.secret") {
  const gets: Get[] = [];
  const lookup = new CloudBranchSaleLookup({
    timeoutMs: 8_000,
    readDeviceToken: async () => token ?? undefined,
    get: async (path, headers, options) => {
      gets.push({ path, headers, options });
      return answer;
    },
  });
  return { gets, lookup };
}

const INVOICE = { kind: "invoice", pointOfSale: 3, number: 1204 } as const;
const DEFERRED = { kind: "deferred", id: "deferred-1", shortCode: "K7Q2" } as const;

describe("finding a sale of another register of the branch in the cloud", () => {
  it("asks for an invoiced ticket by its point of sale and number, with the device token, once", async () => {
    const { gets, lookup } = lookupWith({ kind: "ok", body: ANSWER });

    await lookup.saleForReturn(INVOICE);

    expect(gets).toEqual([
      {
        path: "/api/devices/current/returns/sale?point_of_sale=3&number=1204",
        headers: { authorization: "Bearer prefix.secret" },
        options: { timeoutMs: 8_000, singleAttempt: true },
      },
    ]);
  });

  it("asks for a deferred ticket by its id and short code", async () => {
    const { gets, lookup } = lookupWith({ kind: "ok", body: ANSWER });

    await lookup.saleForReturn(DEFERRED);

    expect(gets.map(({ path }) => path)).toEqual([
      "/api/devices/current/returns/sale?deferred_id=deferred-1&short_code=K7Q2",
    ]);
  });

  it("answers the sale the cloud found as the facts the domain reads", async () => {
    const { lookup } = lookupWith({ kind: "ok", body: ANSWER });

    expect(await lookup.saleForReturn(INVOICE)).toEqual({
      kind: "found",
      sale: {
        sale: {
          id: "sale-1",
          registerId: "register-2",
          deviceId: "device-2",
          sessionId: "session-2",
          actorId: "cashier",
          state: "COMPLETED",
          saleDiscount: {
            kind: "AMOUNT",
            amount: 1500,
            reason: "cliente frecuente",
            authorizedBy: null,
          },
          lines: [
            {
              id: "line-1",
              productId: "yerba",
              productName: "Yerba 1 kg",
              saleUnit: "UNIT",
              quantity: 3,
              promotionId: null,
              lineTotal: 7500,
            },
          ],
        },
        occurredAt: new Date("2026-09-12T18:30:00.000Z"),
        invoice: { pointOfSale: 3, number: 1204 },
        payments: [
          {
            id: "pay-cash",
            method: "CASH",
            provider: "NONE",
            amount: 7500,
            state: "APPROVED",
            refundedAmount: 500,
          },
        ],
        returned: [{ saleLineId: "line-1", quantity: 1, refundedAmount: 2500 }],
      },
      goodConditionReturnDays: 15,
      countedReturnIds: ["return-1"],
    });
  });

  it("reads a sale with a percent discount and no invoice", async () => {
    const { lookup } = lookupWith({
      kind: "ok",
      body: {
        ...ANSWER,
        invoice: null,
        sale: {
          ...ANSWER.sale,
          sale_discount: { kind: "PERCENT", percent: 10, reason: "promo", authorized_by: "u2" },
        },
      },
    });

    expect(await lookup.saleForReturn(DEFERRED)).toMatchObject({
      kind: "found",
      sale: {
        invoice: null,
        sale: {
          saleDiscount: { kind: "PERCENT", percent: 10, reason: "promo", authorizedBy: "u2" },
        },
      },
    });
  });

  it("reads a sale with no discount", async () => {
    const { lookup } = lookupWith({
      kind: "ok",
      body: { ...ANSWER, sale: { ...ANSWER.sale, sale_discount: null } },
    });

    expect(await lookup.saleForReturn(INVOICE)).toMatchObject({
      kind: "found",
      sale: { sale: { saleDiscount: null } },
    });
  });

  it("answers not found when the cloud says the branch holds no such sale", async () => {
    const { lookup } = lookupWith({ kind: "error", error: cloudError("not_found", "no sale") });

    expect(await lookup.saleForReturn(INVOICE)).toEqual({ kind: "not_found" });
  });

  it.each([
    ["the cloud is unreachable", { kind: "unreachable" } satisfies CloudResponse],
    [
      "the cloud refuses for another reason",
      { kind: "error", error: cloudError("server_unavailable", "down") } satisfies CloudResponse,
    ],
    ["the cloud answers a body that is not a sale", { kind: "ok", body: { sale: 1 } }],
  ])("answers unreachable when %s", async (_name, response) => {
    const { lookup } = lookupWith(response);

    expect(await lookup.saleForReturn(INVOICE)).toEqual({ kind: "unreachable" });
  });

  it("answers unreachable, asking nothing, when the register has no device token", async () => {
    const { gets, lookup } = lookupWith({ kind: "ok", body: ANSWER }, null);

    expect(await lookup.saleForReturn(INVOICE)).toEqual({ kind: "unreachable" });
    expect(gets).toEqual([]);
  });
});
