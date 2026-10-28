import { describe, expect, it } from "vitest";
import {
  branchSaleForReturnAnswerSchema,
  branchSaleForReturnQuerySchema,
} from "./branch-sale-for-return.js";

describe("branchSaleForReturnQuerySchema", () => {
  it("reads the point of sale and number of an invoice as the ticket to look for", () => {
    expect(branchSaleForReturnQuerySchema.parse({ point_of_sale: "3", number: "1204" })).toEqual({
      kind: "invoice",
      pointOfSale: 3,
      number: 1204,
    });
  });

  it("reads the id and short code of a deferred ticket as the ticket to look for", () => {
    expect(
      branchSaleForReturnQuerySchema.parse({ deferred_id: "deferred-1", short_code: "7KQ4M2P9" }),
    ).toEqual({ kind: "deferred", id: "deferred-1", shortCode: "7KQ4M2P9" });
  });

  it.each([
    ["nothing", {}],
    ["only a point of sale", { point_of_sale: "3" }],
    ["only a deferred id", { deferred_id: "deferred-1" }],
    ["a point of sale that is not a number", { point_of_sale: "x", number: "1204" }],
    ["a fractional number", { point_of_sale: "3", number: "1.5" }],
    ["a number written with an exponent", { point_of_sale: "3", number: "1e3" }],
    ["a number with a space before it", { point_of_sale: "3", number: " 1204" }],
    ["a number of zero", { point_of_sale: "3", number: "0" }],
    ["a point of sale above the allowed ones", { point_of_sale: "100000", number: "1" }],
    [
      "an invoice and a deferred ticket together",
      {
        point_of_sale: "3",
        number: "1204",
        deferred_id: "deferred-1",
        short_code: "7KQ4M2P9",
      },
    ],
    ["an empty short code", { deferred_id: "deferred-1", short_code: "" }],
  ])("refuses a query with %s", (_name, query) => {
    expect(branchSaleForReturnQuerySchema.safeParse(query).success).toBe(false);
  });
});

const answer = {
  sale: {
    id: "sale-1",
    register_id: "register-2",
    device_id: "device-2",
    session_id: "session-2",
    actor_id: "cashier",
    state: "COMPLETED",
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
  invoice_standing: {
    fiscal_documents: [
      {
        origin: "real_time",
        state: "AUTHORIZED",
        point_of_sale: 3,
        number: 1204,
        buyer_tax_status_code: 5,
      },
    ],
    deferral_pending: false,
  },
  payments: [
    {
      id: "pay-cash",
      method: "CASH",
      provider: "NONE",
      amount: 7500,
      state: "APPROVED",
      refunded_amount: 0,
      card_type: null,
    },
  ],
  returned: [{ sale_line_id: "line-1", quantity: 1, refunded_amount: 2500 }],
  counted_return_ids: ["return-1"],
};

describe("branchSaleForReturnAnswerSchema", () => {
  it("reads the facts the cloud holds of a sale of the branch", () => {
    expect(branchSaleForReturnAnswerSchema.parse(answer)).toEqual(answer);
  });

  it("reads a sale without an invoice, returns or counted returns", () => {
    const bare = {
      ...answer,
      invoice: null,
      invoice_standing: { fiscal_documents: [], deferral_pending: false },
      returned: [],
      counted_return_ids: [],
    };

    expect(branchSaleForReturnAnswerSchema.parse(bare)).toEqual(bare);
  });

  it("reads no discount on the sale's total beside the lines, which are already net of it", () => {
    const discounted = {
      ...answer,
      sale: {
        ...answer.sale,
        sale_discount: { kind: "PERCENT", percent: 10, reason: "promo", authorized_by: "owner" },
      },
    };

    expect(branchSaleForReturnAnswerSchema.parse(discounted).sale).not.toHaveProperty(
      "sale_discount",
    );
  });

  it("reads a date the cloud sends with its time zone offset", () => {
    const withOffset = { ...answer, occurred_at: "2026-09-12T15:30:00.000-03:00" };

    expect(branchSaleForReturnAnswerSchema.parse(withOffset)).toEqual(withOffset);
  });

  it("reads an invoice another register issued offline and one still being requested", () => {
    const standing = {
      fiscal_documents: [
        {
          origin: "offline",
          state: "AUTHORIZED",
          point_of_sale: 4,
          number: 80,
          buyer_tax_status_code: 5,
        },
        {
          origin: "real_time",
          state: "REQUESTING",
          point_of_sale: 3,
          number: 1205,
          buyer_tax_status_code: 6,
        },
      ],
      deferral_pending: true,
    };

    expect(
      branchSaleForReturnAnswerSchema.parse({ ...answer, invoice_standing: standing })
        .invoice_standing,
    ).toEqual(standing);
  });

  it("reads the card a Point payment was paid with", () => {
    const point = {
      ...answer,
      payments: [
        {
          id: "pay-point",
          method: "POINT",
          provider: "MERCADOPAGO_POINT",
          amount: 7500,
          state: "APPROVED",
          refunded_amount: 0,
          card_type: "DEBIT",
        },
      ],
    };

    expect(branchSaleForReturnAnswerSchema.parse(point).payments[0]?.card_type).toBe("DEBIT");
  });

  it("reads a voided sale so the register can say it was voided", () => {
    expect(
      branchSaleForReturnAnswerSchema.safeParse({
        ...answer,
        sale: { ...answer.sale, state: "VOIDED" },
      }).success,
    ).toBe(true);
  });

  it.each([
    ["an open sale", { ...answer, sale: { ...answer.sale, state: "OPEN" } }],
    ["a cancelled sale", { ...answer, sale: { ...answer.sale, state: "CANCELLED" } }],
    ["a date that is not a date", { ...answer, occurred_at: "yesterday" }],
    [
      "an unknown sale unit",
      {
        ...answer,
        sale: { ...answer.sale, lines: [{ ...answer.sale.lines[0], sale_unit: "LITER" }] },
      },
    ],
    ["no invoice standing", { ...answer, invoice_standing: undefined }],
    [
      "an invoice state the register cannot route a credit note by",
      {
        ...answer,
        invoice_standing: {
          fiscal_documents: [
            {
              origin: "real_time",
              state: "REJECTED",
              point_of_sale: 3,
              number: 1204,
              buyer_tax_status_code: 5,
            },
          ],
          deferral_pending: false,
        },
      },
    ],
    [
      "an invoice without its buyer tax status",
      {
        ...answer,
        invoice_standing: {
          fiscal_documents: [
            { origin: "real_time", state: "AUTHORIZED", point_of_sale: 3, number: 1204 },
          ],
          deferral_pending: false,
        },
      },
    ],
    ["no counted return ids", { ...answer, counted_return_ids: undefined }],
    [
      "a payment without its card type",
      { ...answer, payments: [{ ...answer.payments[0], card_type: undefined }] },
    ],
    [
      "an unknown card type",
      { ...answer, payments: [{ ...answer.payments[0], card_type: "PREPAID" }] },
    ],
    [
      "a fractional quantity",
      {
        ...answer,
        returned: [{ sale_line_id: "line-1", quantity: 1.5, refunded_amount: 0 }],
      },
    ],
  ])("refuses an answer with %s", (_name, body) => {
    expect(branchSaleForReturnAnswerSchema.safeParse(body).success).toBe(false);
  });
});
