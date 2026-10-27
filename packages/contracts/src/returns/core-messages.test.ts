import { PIN_SIGN_IN_LOCKOUT_FAILURES, TAX_AUTHORITY_QR_URL } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import {
  returnsCoreToRendererMessageSchema,
  returnsRendererToCoreMessageSchema,
} from "./core-messages.js";

const REQUEST_ID = "7d1c1e1e-5b1a-4a53-9c1c-3a7c6f0b2d10";

function fiscalQr(voucherType: number, pointOfSale = 3, number = 1204): string {
  const payload = { ver: 1, ptoVta: pointOfSale, tipoCmp: voucherType, nroCmp: number };
  return `${TAX_AUTHORITY_QR_URL}${btoa(JSON.stringify(payload))}`;
}

function finding(reading: unknown, extra: Record<string, unknown> = {}) {
  return { type: "find-sale-for-return", request_id: REQUEST_ID, reading, ...extra };
}

describe("finding the sale to return from the ticket", () => {
  it("reads the point of sale and number typed as the invoice to look for, recording that it was typed", () => {
    expect(
      returnsRendererToCoreMessageSchema.parse(
        finding({ kind: "typed", point_of_sale: 3, number: 1204 }),
      ),
    ).toEqual(
      finding({
        source: "TYPED",
        ticket: { kind: "invoice", pointOfSale: 3, number: 1204 },
      }),
    );
  });

  it("reads the fiscal QR of a factura C as the invoice it carries, recording that it was scanned", () => {
    expect(
      returnsRendererToCoreMessageSchema.parse(finding({ kind: "scanned", text: fiscalQr(11) })),
    ).toEqual(
      finding({
        source: "QR",
        ticket: { kind: "invoice", pointOfSale: 3, number: 1204 },
      }),
    );
  });

  it("reads the QR of a deferred sale's ticket as the deferred sale it names", () => {
    expect(
      returnsRendererToCoreMessageSchema.parse(
        finding({ kind: "scanned", text: "purosur-deferred-sale:0198-abc:7KQ4M2P9" }),
      ),
    ).toEqual(
      finding({
        source: "QR",
        ticket: { kind: "deferred", id: "0198-abc", shortCode: "7KQ4M2P9" },
      }),
    );
  });

  it("carries the authorization of another person when the cashier lacks the permission", () => {
    const authorization = { user_id: "u2", pin: "1234" };

    expect(
      returnsRendererToCoreMessageSchema.parse(
        finding({ kind: "typed", point_of_sale: 3, number: 1204 }, { authorization }),
      ),
    ).toMatchObject({ authorization });
  });

  it.each([
    ["a credit note's QR", fiscalQr(13)],
    ["another kind of QR", "https://example.test/qr"],
    ["a deferred sale's QR with an invalid code", "purosur-deferred-sale:0198-abc:7KQ4M2P0"],
    ["nothing", ""],
  ])("rejects a scanned text that is %s", (_case, text) => {
    expect(
      returnsRendererToCoreMessageSchema.safeParse(finding({ kind: "scanned", text })).success,
    ).toBe(false);
  });

  it.each([
    ["a zero point of sale", { point_of_sale: 0, number: 1 }],
    ["a negative point of sale", { point_of_sale: -1, number: 1 }],
    ["a fractional point of sale", { point_of_sale: 1.5, number: 1 }],
    ["a point of sale beyond the tax authority's", { point_of_sale: 100_000, number: 1 }],
    ["a zero number", { point_of_sale: 3, number: 0 }],
    ["a negative number", { point_of_sale: 3, number: -5 }],
    ["a fractional number", { point_of_sale: 3, number: 1.5 }],
    ["a number that is text", { point_of_sale: 3, number: "1204" }],
    ["no number", { point_of_sale: 3 }],
    ["no point of sale", { number: 1 }],
  ])("rejects a typed reading with %s", (_case, fields) => {
    expect(
      returnsRendererToCoreMessageSchema.safeParse(finding({ kind: "typed", ...fields })).success,
    ).toBe(false);
  });

  function messagesOf(reading: unknown): string[] {
    const result = returnsRendererToCoreMessageSchema.safeParse(finding(reading));
    if (result.success) {
      return [];
    }
    return result.error.issues.flatMap((issue) =>
      "errors" in issue ? issue.errors.flat().map(({ message }) => message) : [issue.message],
    );
  }

  it.each([
    ["a QR of another kind", "https://example.test/qr"],
    ["a text that is not text", 7_000_000],
  ])("says the text must be the QR of a sale's ticket for %s", (_case, text) => {
    expect(messagesOf({ kind: "scanned", text })).toContain(
      "text must be the QR of a sale's ticket",
    );
  });

  it("rejects a reading that is neither scanned nor typed, since no sale is searched by date, amount or product", () => {
    expect(
      returnsRendererToCoreMessageSchema.safeParse(
        finding({ kind: "searched", date: "2026-09-12", total: 1000 }),
      ).success,
    ).toBe(false);
  });
});

const DRAFT_LINE = {
  sale_line_id: "line-1",
  quantity: 2,
  reason: "change_of_mind",
  disposition: "restock",
};

describe("previewing a return", () => {
  const preview = (lines: unknown[]) => ({
    type: "preview-return",
    request_id: REQUEST_ID,
    sale_id: "sale-1",
    lines,
  });

  it("carries the lines the cashier entered, including those with no reason or disposition yet", () => {
    const message = preview([DRAFT_LINE, { ...DRAFT_LINE, reason: null, disposition: null }]);

    expect(returnsRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    ["a fractional quantity", { quantity: 1.5 }],
    ["a quantity that is text", { quantity: "2" }],
    ["a reason nobody gives", { reason: "wrong_size" }],
    ["a disposition nobody chooses", { disposition: "donate" }],
    ["no line", { sale_line_id: undefined }],
  ])("rejects a line with %s", (_case, change) => {
    expect(
      returnsRendererToCoreMessageSchema.safeParse(preview([{ ...DRAFT_LINE, ...change }])).success,
    ).toBe(false);
  });

  it("rejects a message without a sale", () => {
    expect(
      returnsRendererToCoreMessageSchema.safeParse({
        type: "preview-return",
        request_id: REQUEST_ID,
        lines: [],
      }).success,
    ).toBe(false);
  });
});

describe("completing a return", () => {
  const complete = (extra: Record<string, unknown> = {}) => ({
    type: "complete-return",
    request_id: REQUEST_ID,
    sale_id: "sale-1",
    ticket_source: "QR",
    lines: [DRAFT_LINE],
    refunds: [{ payment_id: "pay-1", amount: 5000 }],
    ...extra,
  });

  it("carries the lines, how the ticket was read and the payments the refund is imputed to", () => {
    expect(returnsRendererToCoreMessageSchema.parse(complete())).toEqual(complete());
  });

  it.each(["QR", "TYPED"])("accepts a ticket read by %s", (ticket_source) => {
    expect(returnsRendererToCoreMessageSchema.safeParse(complete({ ticket_source })).success).toBe(
      true,
    );
  });

  it("carries the authorization of another person", () => {
    const authorization = { user_id: "u2", pin: "1234" };

    expect(returnsRendererToCoreMessageSchema.parse(complete({ authorization }))).toEqual(
      complete({ authorization }),
    );
  });

  it("accepts a return that imputes the refund to no payment, for the core to refuse or complete", () => {
    expect(returnsRendererToCoreMessageSchema.safeParse(complete({ refunds: [] })).success).toBe(
      true,
    );
  });

  it.each([
    ["a ticket source nobody reads", { ticket_source: "SCAN" }],
    ["no ticket source", { ticket_source: undefined }],
    ["no sale", { sale_id: undefined }],
    ["a fractional refund", { refunds: [{ payment_id: "pay-1", amount: 10.5 }] }],
    ["a refund without a payment", { refunds: [{ amount: 100 }] }],
    ["a refund amount that is text", { refunds: [{ payment_id: "pay-1", amount: "100" }] }],
    ["lines that are not a list", { lines: "all" }],
    ["no refunds", { refunds: undefined }],
  ])("rejects %s", (_case, change) => {
    expect(returnsRendererToCoreMessageSchema.safeParse(complete(change)).success).toBe(false);
  });
});

const LINE_REFUSALS = [
  { kind: "unknown_line" },
  { kind: "duplicate_line" },
  { kind: "invalid_quantity" },
  { kind: "missing_reason" },
  { kind: "missing_disposition" },
  { kind: "quantity_exceeds_returnable", returnable: 3 },
  { kind: "promotion_whole_only", returnable: 4 },
  { kind: "outside_window", reason: "change_of_mind", last_allowed_day: "2026-09-27" },
  { kind: "outside_window", reason: "defective", last_allowed_day: "2027-03-12" },
];

const REFUND_REFUSALS = [
  { kind: "unknown_payment", payment_id: "pay-1" },
  { kind: "invalid_amount", payment_id: "pay-1" },
  { kind: "not_cash", payment_id: "pay-1" },
  { kind: "exceeds_payment", payment_id: "pay-1", remaining: 200 },
  { kind: "total_mismatch", refundable_total: 7000, imputed: 6999 },
];

const FOUND = {
  kind: "found",
  sale: {
    sale_id: "sale-1",
    occurred_at: "2026-09-12T18:30:00.000Z",
    total: 21_500,
    invoice: { point_of_sale: 3, number: 1204 },
    windows: {
      change_of_mind: { last_allowed_day: "2026-09-27", open: true },
      defective: { last_allowed_day: "2027-03-12", open: true },
    },
    lines: [
      {
        id: "line-1",
        product_id: "yerba",
        product_name: "Yerba 1 kg",
        sale_unit: "UNIT",
        sold_quantity: 3,
        returned_quantity: 0,
        returnable_quantity: 3,
        charged_amount: 7500,
        refunded_amount: 0,
        must_be_returned_whole: false,
      },
    ],
    payments: [
      {
        payment_id: "pay-cash",
        method: "CASH",
        amount: 15_000,
        refunded_amount: 0,
        remaining: 15_000,
        eligible: true,
        ineligible_reason: null,
      },
      {
        payment_id: "pay-transfer",
        method: "TRANSFER",
        amount: 6500,
        refunded_amount: 0,
        remaining: 6500,
        eligible: false,
        ineligible_reason: "not_cash",
      },
    ],
  },
};

function result(type: string, outcome: unknown) {
  return { type, request_id: REQUEST_ID, outcome };
}

const AUTHORIZATION_REFUSALS = [
  { kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 2 },
  { kind: "locked", consecutive_failures: PIN_SIGN_IN_LOCKOUT_FAILURES },
  { kind: "lacks_permission" },
  { kind: "unavailable" },
];

describe("the answer to finding the sale to return", () => {
  it.each([
    FOUND,
    {
      ...FOUND,
      sale: { ...FOUND.sale, invoice: null },
    },
    {
      ...FOUND,
      sale: {
        ...FOUND.sale,
        lines: [{ ...FOUND.sale.lines[0], must_be_returned_whole: true, sale_unit: "KG" }],
      },
    },
    { kind: "not_found" },
    { kind: "voided" },
    { kind: "not_signed_in" },
    ...AUTHORIZATION_REFUSALS,
  ])("accepts the outcome $kind", (outcome) => {
    const message = result("find-sale-for-return-result", outcome);

    expect(returnsCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts the date of the sale with the offset it was written in, and a payment with nothing left", () => {
    const message = result("find-sale-for-return-result", {
      ...FOUND,
      sale: {
        ...FOUND.sale,
        occurred_at: "2026-09-12T15:30:00-03:00",
        payments: [
          { ...FOUND.sale.payments[0], eligible: false, ineligible_reason: "nothing_left" },
        ],
      },
    });

    expect(returnsCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { kind: "found" },
    { ...FOUND, sale: { ...FOUND.sale, occurred_at: "yesterday" } },
    { ...FOUND, sale: { ...FOUND.sale, total: 10.5 } },
    {
      ...FOUND,
      sale: {
        ...FOUND.sale,
        windows: {
          ...FOUND.sale.windows,
          change_of_mind: { last_allowed_day: "soon", open: true },
        },
      },
    },
    {
      ...FOUND,
      sale: {
        ...FOUND.sale,
        payments: [{ ...FOUND.sale.payments[0], ineligible_reason: "too_old" }],
      },
    },
    {
      ...FOUND,
      sale: {
        ...FOUND.sale,
        payments: [{ ...FOUND.sale.payments[0], method: "CARD" }],
      },
    },
    { kind: "sale_not_returnable" },
    { kind: "somewhere_else" },
    {},
  ])("rejects the outcome %j", (outcome) => {
    expect(
      returnsCoreToRendererMessageSchema.safeParse(result("find-sale-for-return-result", outcome))
        .success,
    ).toBe(false);
  });
});

describe("the answer to previewing a return", () => {
  const previewed = {
    kind: "previewed",
    lines: [
      {
        sale_line_id: "line-1",
        quantity: 2,
        reason: "change_of_mind",
        disposition: "restock",
        refusal: null,
        refund_amount: 5000,
      },
      {
        sale_line_id: "line-3",
        quantity: 250,
        reason: null,
        disposition: null,
        refusal: { kind: "missing_reason" },
        refund_amount: null,
      },
    ],
    refundable_total: 5000,
  };

  it.each([
    previewed,
    { ...previewed, lines: [] },
    ...LINE_REFUSALS.map((refusal) => ({
      ...previewed,
      lines: [{ ...previewed.lines[1], refusal }],
    })),
    { kind: "not_found" },
    { kind: "sale_not_returnable" },
    { kind: "unavailable" },
    { kind: "not_signed_in" },
    { kind: "lacks_permission" },
  ])("accepts the outcome $kind", (outcome) => {
    const message = result("preview-return-result", outcome);

    expect(returnsCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { ...previewed, refundable_total: 10.5 },
    { ...previewed, lines: [{ ...previewed.lines[0], refund_amount: "5000" }] },
    { ...previewed, lines: [{ ...previewed.lines[1], refusal: { kind: "too_late" } }] },
    { ...previewed, lines: [{ ...previewed.lines[0], refusal: undefined }] },
    { kind: "previewed" },
    { kind: "voided" },
  ])("rejects the outcome %j", (outcome) => {
    expect(
      returnsCoreToRendererMessageSchema.safeParse(result("preview-return-result", outcome))
        .success,
    ).toBe(false);
  });
});

describe("the answer to completing a return", () => {
  const completed = {
    kind: "completed",
    return_id: "return-1",
    refunded_total: 7000,
    refunds: [{ payment_id: "pay-cash", method: "CASH", amount: 7000, state: "APPROVED" }],
    authorized_by: { user_id: "u2", first_name: "Ana" },
  };

  it.each([
    completed,
    { ...completed, authorized_by: null },
    { ...completed, refunds: [], refunded_total: 0 },
    { kind: "not_found" },
    { kind: "sale_not_returnable" },
    { kind: "no_open_session" },
    { kind: "no_lines" },
    ...LINE_REFUSALS.map((refusal) => ({ kind: "line_refused", sale_line_id: "line-1", refusal })),
    ...REFUND_REFUSALS.map((refusal) => ({ kind: "refund_refused", refusal })),
    { kind: "not_signed_in" },
    ...AUTHORIZATION_REFUSALS,
  ])("accepts the outcome $kind", (outcome) => {
    const message = result("complete-return-result", outcome);

    expect(returnsCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { kind: "completed", refunded_total: 7000 },
    { ...completed, authorized_by: undefined },
    { ...completed, refunded_total: 10.5 },
    { ...completed, refunds: [{ ...completed.refunds[0], method: "CARD" }] },
    { kind: "line_refused", refusal: LINE_REFUSALS[0] },
    { kind: "line_refused", sale_line_id: "line-1", refusal: { kind: "too_late" } },
    { kind: "refund_refused", refusal: { kind: "exceeds_payment", payment_id: "pay-1" } },
    { kind: "refund_refused" },
    { kind: "voided" },
  ])("rejects the outcome %j", (outcome) => {
    expect(
      returnsCoreToRendererMessageSchema.safeParse(result("complete-return-result", outcome))
        .success,
    ).toBe(false);
  });
});

describe("the outcome of finding the sale to return", () => {
  it("tells the renderer that a sale of another register needs a connection", () => {
    const message = {
      type: "find-sale-for-return-result",
      request_id: REQUEST_ID,
      outcome: { kind: "needs_connection" },
    };

    expect(returnsCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });
});
