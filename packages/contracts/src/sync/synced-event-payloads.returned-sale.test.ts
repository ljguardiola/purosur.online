import { describe, expect, it } from "vitest";
import {
  READABLE_EVENT_VERSIONS,
  syncedEventPayloadKey,
  syncedEventPayloadSchema,
} from "./synced-event-payloads.js";

type Payload = Record<string, unknown>;

const OCCURRED_AT = "2026-10-08T10:00:00.000Z";

const RETURNED: Payload = {
  id: "0199b7a0-0000-7000-8000-000000000a01",
  sale_id: "0199b7a0-0000-7000-8000-000000000a02",
  register_id: "a41d9e07-52c3-4b68-8f2e-1c7d3a9b6e02",
  device_id: "6f0c2a1e-3b54-4d7a-9c10-5e8a7b2d4f01",
  session_id: "0199b7a0-0000-7000-8000-000000000a03",
  actor_id: "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03",
  authorized_by: null,
  ticket_source: "QR",
  occurred_at: OCCURRED_AT,
  lines: [
    {
      sale_line_id: "0199b7a0-0000-7000-8000-000000000a04",
      product_id: "5d1a8f3c-9e47-4b02-8c6d-7a3f2e9b1c06",
      quantity: 2,
      reason: "change_of_mind",
      disposition: "restock",
      refunded_amount: 5000,
    },
    {
      sale_line_id: "0199b7a0-0000-7000-8000-000000000a05",
      product_id: "5d1a8f3c-9e47-4b02-8c6d-7a3f2e9b1c07",
      quantity: 250,
      reason: "defective",
      disposition: "discard",
      refunded_amount: 2000,
    },
  ],
  refunds: [
    {
      id: "0199b7a0-0000-7000-8000-000000000a06",
      kind: "REFUND",
      parent_id: "0199b7a0-0000-7000-8000-000000000a07",
      method: "CASH",
      provider: "NONE",
      amount: 7000,
      state: "APPROVED",
      occurred_at: OCCURRED_AT,
    },
  ],
  cash_movements: [
    {
      id: "0199b7a0-0000-7000-8000-000000000a08",
      type: "REFUND",
      amount: 7000,
      ref_type: "return",
      ref_id: "0199b7a0-0000-7000-8000-000000000a01",
      actor_id: "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03",
      occurred_at: OCCURRED_AT,
    },
  ],
  stock_movements: [
    {
      id: "0199b7a0-0000-7000-8000-000000000a09",
      sale_line_id: "0199b7a0-0000-7000-8000-000000000a04",
      product_id: "5d1a8f3c-9e47-4b02-8c6d-7a3f2e9b1c06",
      kind: "return",
      reason: null,
      delta: 2000,
      occurred_at: OCCURRED_AT,
    },
    {
      id: "0199b7a0-0000-7000-8000-000000000a0a",
      sale_line_id: "0199b7a0-0000-7000-8000-000000000a05",
      product_id: "5d1a8f3c-9e47-4b02-8c6d-7a3f2e9b1c07",
      kind: "loss",
      reason: "return_discard",
      delta: -250,
      occurred_at: OCCURRED_AT,
    },
  ],
};

function accepts(payload: unknown): boolean {
  return syncedEventPayloadSchema("sale_returned@1").safeParse(payload).success;
}

function withLine(change: Payload): Payload {
  const [first, ...rest] = RETURNED["lines"] as Payload[];
  return { ...RETURNED, lines: [{ ...first, ...change }, ...rest] };
}

describe("sale_returned v1", () => {
  it("is a version the cloud reads", () => {
    expect(syncedEventPayloadKey("sale_returned", 1)).toBe("sale_returned@1");
    expect(READABLE_EVENT_VERSIONS).toContain("sale_returned@1");
  });

  it.each([
    ["version zero", 0],
    ["a version nobody emitted", 4],
  ])("has no schema for %s", (_case, schemaVersion) => {
    expect(syncedEventPayloadKey("sale_returned", schemaVersion)).toBeUndefined();
  });

  it("accepts a return with its lines, its cash refund, its cash movement and its stock", () => {
    expect(accepts(RETURNED)).toBe(true);
  });

  it("accepts a return authorized by another person, read by typing the ticket", () => {
    expect(accepts({ ...RETURNED, authorized_by: "user-2", ticket_source: "TYPED" })).toBe(true);
  });

  it("accepts a return that refunds nothing, with no refund and no cash movement", () => {
    expect(accepts({ ...RETURNED, refunds: [], cash_movements: [] })).toBe(true);
  });

  it("refuses a return without any one of its fields", () => {
    const accepted = Object.keys(RETURNED).filter((key) => {
      const { [key]: _removed, ...rest } = RETURNED;
      return accepts(rest);
    });

    expect(accepted).toEqual([]);
  });

  it("refuses a return with any one of its fields of the wrong type", () => {
    const accepted = Object.keys(RETURNED).filter((key) =>
      accepts({ ...RETURNED, [key]: { unexpected: true } }),
    );

    expect(accepted).toEqual([]);
  });

  it.each([null, [], "return"])("refuses %j, which is not an object", (payload) => {
    expect(accepts(payload)).toBe(false);
  });

  it.each([
    ["a ticket source nobody reads", { ticket_source: "SCAN" }],
    ["a date that is not ISO", { occurred_at: "yesterday" }],
    ["an empty id", { id: "" }],
    ["no lines", { lines: [] }],
  ])("refuses %s", (_case, change) => {
    expect(accepts({ ...RETURNED, ...change })).toBe(false);
  });

  it.each([
    ["a reason nobody gives", { reason: "wrong_size" }],
    ["a disposition nobody chooses", { disposition: "donate" }],
    ["no disposition", { disposition: null }],
    ["no reason", { reason: null }],
    ["a zero quantity", { quantity: 0 }],
    ["a negative quantity", { quantity: -1 }],
    ["a fractional quantity", { quantity: 1.5 }],
    ["a negative refunded amount", { refunded_amount: -1 }],
    ["a fractional refunded amount", { refunded_amount: 0.5 }],
  ])("refuses a line with %s", (_case, change) => {
    expect(accepts(withLine(change))).toBe(false);
  });

  it("accepts a line that refunded nothing", () => {
    expect(accepts(withLine({ refunded_amount: 0 }))).toBe(true);
  });

  describe("the refunds", () => {
    const refund = (change: Payload) => ({
      ...RETURNED,
      refunds: [{ ...(RETURNED["refunds"] as Payload[])[0], ...change }],
    });

    it.each([
      ["a transfer", { method: "TRANSFER" }],
      ["a pending refund", { state: "PENDING" }],
      ["another provider", { provider: "MERCADOPAGO_QR" }],
      ["a refund kind that is not a refund", { kind: "SALE" }],
      ["a negative amount", { amount: -1 }],
      ["a fractional amount", { amount: 1.5 }],
      ["no payment it refunds", { parent_id: "" }],
    ])("refuses %s, since only cash is refunded from the register", (_case, change) => {
      expect(accepts(refund(change))).toBe(false);
    });
  });

  describe("the cash movements", () => {
    const movement = (change: Payload) => ({
      ...RETURNED,
      cash_movements: [{ ...(RETURNED["cash_movements"] as Payload[])[0], ...change }],
    });

    it.each([
      ["another movement type", { type: "SALE" }],
      ["a reference to another kind of record", { ref_type: "sale" }],
      ["a reference without an id", { ref_id: "" }],
      ["a negative amount", { amount: -1 }],
      ["a fractional amount", { amount: 1.5 }],
    ])("refuses %s", (_case, change) => {
      expect(accepts(movement(change))).toBe(false);
    });
  });

  describe("the stock movements", () => {
    const stock = (change: Payload) => ({
      ...RETURNED,
      stock_movements: [{ ...(RETURNED["stock_movements"] as Payload[])[0], ...change }],
    });

    it.each([
      ["a kind nobody records for a return", { kind: "sale" }],
      ["a loss reason a person picks", { kind: "loss", reason: "theft" }],
      ["a fractional quantity", { delta: 1.5 }],
      ["no product", { product_id: "" }],
    ])("refuses %s", (_case, change) => {
      expect(accepts(stock(change))).toBe(false);
    });

    it("accepts a loss with the reason the system gives the items thrown away", () => {
      expect(accepts(stock({ kind: "loss", reason: "return_discard", delta: -2000 }))).toBe(true);
    });
  });
});

describe("sale_returned v3", () => {
  const RETURNED_V3: Payload = { ...RETURNED, credit_note: null };
  const refundsOf = (...refunds: Payload[]): Payload => ({
    ...RETURNED_V3,
    refunds: refunds.map((refund) => ({ ...(RETURNED["refunds"] as Payload[])[0], ...refund })),
  });
  const acceptsV3 = (payload: unknown) =>
    syncedEventPayloadSchema("sale_returned@3").safeParse(payload).success;

  it("is a version the cloud reads", () => {
    expect(syncedEventPayloadKey("sale_returned", 3)).toBe("sale_returned@3");
    expect(READABLE_EVENT_VERSIONS).toContain("sale_returned@3");
  });

  it("accepts a return refunded in cash, as a version 2 return was", () => {
    expect(acceptsV3(RETURNED_V3)).toBe(true);
  });

  it.each([
    ["a transfer", { method: "TRANSFER", provider: "NONE" }],
    ["a standalone terminal", { method: "STANDALONE_TERMINAL", provider: "EXTERNAL_TERMINAL" }],
    ["a Mercado Pago QR", { method: "QR", provider: "MERCADOPAGO_QR" }],
    ["a Mercado Pago Point", { method: "POINT", provider: "MERCADOPAGO_POINT" }],
  ])("accepts a refund to %s that is still pending", (_case, change) => {
    expect(acceptsV3(refundsOf({ ...change, state: "PENDING" }))).toBe(true);
  });

  it("accepts a return split between cash and a payment that is not cash, with the cash movement of the cash part only", () => {
    const split = refundsOf(
      { amount: 4000 },
      {
        id: "0199b7a0-0000-7000-8000-000000000a0c",
        method: "QR",
        provider: "MERCADOPAGO_QR",
        state: "PENDING",
        amount: 3000,
      },
    );

    expect(
      acceptsV3({
        ...split,
        cash_movements: [{ ...(RETURNED["cash_movements"] as Payload[])[0], amount: 4000 }],
      }),
    ).toBe(true);
  });

  it("accepts a return refunded only to a payment that is not cash, with no cash movement", () => {
    expect(
      acceptsV3({
        ...refundsOf({ method: "TRANSFER", provider: "NONE", state: "PENDING" }),
        cash_movements: [],
      }),
    ).toBe(true);
  });

  it.each([
    ["a pending cash refund", { state: "PENDING" }],
    ["an approved transfer refund", { method: "TRANSFER", provider: "NONE", state: "APPROVED" }],
    ["an approved QR refund", { method: "QR", provider: "MERCADOPAGO_QR", state: "APPROVED" }],
    ["a QR refund of another provider", { method: "QR", provider: "NONE", state: "PENDING" }],
    [
      "a Point refund of the QR provider",
      { method: "POINT", provider: "MERCADOPAGO_QR", state: "PENDING" },
    ],
    ["a method nobody pays with", { method: "CARD", provider: "NONE", state: "PENDING" }],
    ["a refund kind that is not a refund", { kind: "SALE" }],
    ["a negative amount", { amount: -1 }],
  ])("refuses %s", (_case, change) => {
    expect(acceptsV3(refundsOf(change))).toBe(false);
  });

  it("still refuses what version 2 refused for lack of a field", () => {
    const { credit_note: _removed, ...withoutCreditNote } = RETURNED_V3;

    expect(acceptsV3(withoutCreditNote)).toBe(false);
  });
});
