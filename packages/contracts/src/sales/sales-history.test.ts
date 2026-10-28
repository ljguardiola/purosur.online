import { describe, expect, it } from "vitest";
import { saleHistoryDetailOutcomeSchema } from "./sales-history.js";

const detail = {
  sale_id: "sale-1",
  occurred_at: "2026-10-09T11:05:00.000-03:00",
  total: 5000,
  comprobante: { kind: "none" },
  operation_number: null,
  served_by_first_name: "Marta",
  line_count: 1,
  payments: [{ method: "POINT", card_type: "CREDIT", amount: 5000 }],
  state: "completed",
  voidability: {
    kind: "voidable",
    refunds: [
      {
        method: "POINT",
        card_type: "CREDIT",
        amount: 5000,
        state: "PENDING",
        sent_by_cloud: true,
      },
    ],
    credit_note_corrects: null,
  },
  void_authorization_required: false,
  credit_note: null,
  credit_note_id: null,
  reprint: { kind: "available" },
  next_copy: { kind: "original" },
  credit_note_next_copy: null,
  deferred_invoice_next_copy: null,
  short_code: null,
};

function outcome(changes: Record<string, unknown>) {
  return { kind: "found", detail: { ...detail, ...changes } };
}

describe("saleHistoryDetailOutcomeSchema", () => {
  it("accepts a sale whose payments and refunds carry the card type of a Point payment", () => {
    expect(saleHistoryDetailOutcomeSchema.safeParse(outcome({})).success).toBe(true);
  });

  it("accepts payments and refunds without a card type, as null", () => {
    expect(
      saleHistoryDetailOutcomeSchema.safeParse(
        outcome({
          payments: [{ method: "CASH", card_type: null, amount: 5000 }],
          voidability: {
            kind: "voidable",
            refunds: [
              {
                method: "CASH",
                card_type: null,
                amount: 5000,
                state: "APPROVED",
                sent_by_cloud: false,
              },
            ],
            credit_note_corrects: null,
          },
        }),
      ).success,
    ).toBe(true);
  });

  it("refuses a payment without its card type field", () => {
    expect(
      saleHistoryDetailOutcomeSchema.safeParse(
        outcome({ payments: [{ method: "POINT", amount: 5000 }] }),
      ).success,
    ).toBe(false);
  });

  it("refuses a payment whose card type is not one a Point charges", () => {
    expect(
      saleHistoryDetailOutcomeSchema.safeParse(
        outcome({ payments: [{ method: "POINT", card_type: "PREPAID", amount: 5000 }] }),
      ).success,
    ).toBe(false);
  });

  it("refuses a refund without its card type field", () => {
    expect(
      saleHistoryDetailOutcomeSchema.safeParse(
        outcome({
          voidability: {
            kind: "voidable",
            refunds: [{ method: "POINT", amount: 5000, state: "PENDING", sent_by_cloud: true }],
            credit_note_corrects: null,
          },
        }),
      ).success,
    ).toBe(false);
  });
});
