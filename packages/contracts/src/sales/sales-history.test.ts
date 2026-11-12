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
  lines: [{ product_name: "Almendras peladas", sale_unit: "KG", quantity: 325, line_total: 6142 }],
  cash_rounding: 92,
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
  reprint_authorization_required: false,
  credit_notes: [],
  reprint: { kind: "available" },
  next_copy: { kind: "original" },
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

  describe("the lines and the cash rounding of the sale", () => {
    const line: Record<string, unknown> = {
      product_name: "Yerba mate orgánica",
      sale_unit: "UNIT",
      quantity: 2,
      line_total: 1,
    };
    const accepts = (changes: Record<string, unknown>) =>
      saleHistoryDetailOutcomeSchema.safeParse(outcome(changes)).success;

    it("accepts weighed and counted lines, and a sale with no cash rounding", () => {
      expect(accepts({ lines: [line, { ...line, sale_unit: "KG", quantity: 325 }] })).toBe(true);
      expect(accepts({ cash_rounding: 0 })).toBe(true);
    });

    it("refuses a sale without its lines or its cash rounding", () => {
      expect(accepts({ lines: undefined })).toBe(false);
      expect(accepts({ cash_rounding: undefined })).toBe(false);
    });

    it("refuses a line without any one of its fields", () => {
      for (const field of Object.keys(line)) {
        const { [field]: _removed, ...rest } = line;

        expect(accepts({ lines: [rest] }), field).toBe(false);
      }
    });

    it("refuses a line of a sale unit that is neither counted nor weighed", () => {
      expect(accepts({ lines: [{ ...line, sale_unit: "LITER" }] })).toBe(false);
    });

    it("refuses a line whose quantity is not a positive whole number", () => {
      expect(accepts({ lines: [{ ...line, quantity: 0 }] })).toBe(false);
      expect(accepts({ lines: [{ ...line, quantity: 1.5 }] })).toBe(false);
    });

    it("refuses a line amount with decimals", () => {
      expect(accepts({ lines: [{ ...line, line_total: 1.5 }] })).toBe(false);
    });

    it("refuses a cash rounding a cash payment could not leave", () => {
      expect(accepts({ cash_rounding: -1 })).toBe(false);
      expect(accepts({ cash_rounding: 10000 })).toBe(false);
      expect(accepts({ cash_rounding: 92.5 })).toBe(false);
    });
  });

  describe("whether reprinting needs authorization", () => {
    it.each([true, false])("accepts %s", (required) => {
      expect(
        saleHistoryDetailOutcomeSchema.safeParse(
          outcome({ reprint_authorization_required: required }),
        ).success,
      ).toBe(true);
    });

    it.each([undefined, "true", null, 1])("refuses %j", (required) => {
      expect(
        saleHistoryDetailOutcomeSchema.safeParse(
          outcome({ reprint_authorization_required: required }),
        ).success,
      ).toBe(false);
    });
  });

  describe("the credit notes of the sale", () => {
    const creditNote: Record<string, unknown> = {
      credit_note_id: "credit-note-1",
      origin: "sale_void",
      standing: { kind: "in_progress" },
      next_copy: null,
    };
    const accepts = (credit_notes: unknown[]) =>
      saleHistoryDetailOutcomeSchema.safeParse(outcome({ credit_notes })).success;

    it("accepts a sale with no credit note and one with the void's and each return's", () => {
      expect(accepts([])).toBe(true);
      expect(
        accepts([
          creditNote,
          { ...creditNote, credit_note_id: "credit-note-2", origin: "sale_return" },
          {
            ...creditNote,
            credit_note_id: "credit-note-3",
            origin: "sale_return",
            standing: { kind: "regularization_required" },
          },
        ]),
      ).toBe(true);
    });

    it("accepts the next copy of a credit note, an original or a numbered duplicate", () => {
      expect(accepts([{ ...creditNote, next_copy: { kind: "original" } }])).toBe(true);
      expect(accepts([{ ...creditNote, next_copy: { kind: "duplicate", order_number: 2 } }])).toBe(
        true,
      );
      expect(accepts([{ ...creditNote, next_copy: { kind: "duplicate", order_number: 0 } }])).toBe(
        false,
      );
    });

    it("refuses a credit note that names no credit note or names an empty one", () => {
      expect(accepts([{ ...creditNote, credit_note_id: "" }])).toBe(false);
      expect(accepts([{ ...creditNote, credit_note_id: null }])).toBe(false);
    });

    it("refuses an origin that is not a void's or a return's", () => {
      expect(accepts([{ ...creditNote, origin: "refund" }])).toBe(false);
    });

    it("refuses a credit note without any one of its fields", () => {
      for (const field of Object.keys(creditNote)) {
        const { [field]: _removed, ...rest } = creditNote;

        expect(accepts([rest]), field).toBe(false);
      }
    });

    it("refuses a standing that is not one of a credit note", () => {
      expect(accepts([{ ...creditNote, standing: { kind: "issued" } }])).toBe(false);
    });
  });
});
