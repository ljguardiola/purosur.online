import { describe, expect, it } from "vitest";
import { findSaleForReturnOutcomeSchema } from "./return.js";

const payment = {
  payment_id: "pay-1",
  method: "POINT",
  card_type: "DEBIT",
  amount: 5000,
  refunded_amount: 0,
  remaining: 5000,
  eligible: false,
  ineligible_reason: "not_cash",
};

function found(paymentBody: Record<string, unknown>) {
  return {
    kind: "found",
    sale: {
      sale_id: "sale-1",
      occurred_at: "2026-09-12T11:42:00.000-03:00",
      total: 5000,
      invoice: null,
      windows: {
        change_of_mind: { last_allowed_day: "2026-09-27", open: true },
        defective: { last_allowed_day: "2027-03-12", open: true },
      },
      lines: [],
      payments: [paymentBody],
    },
  };
}

describe("findSaleForReturnOutcomeSchema", () => {
  it.each(["DEBIT", "CREDIT", null])("accepts a payment with card type %s", (card_type) => {
    expect(findSaleForReturnOutcomeSchema.safeParse(found({ ...payment, card_type })).success).toBe(
      true,
    );
  });

  it("refuses a payment without its card type field", () => {
    const { card_type: _cardType, ...withoutCardType } = payment;

    expect(findSaleForReturnOutcomeSchema.safeParse(found(withoutCardType)).success).toBe(false);
  });

  it("refuses a card type a Point does not charge", () => {
    expect(
      findSaleForReturnOutcomeSchema.safeParse(found({ ...payment, card_type: "PREPAID" })).success,
    ).toBe(false);
  });
});
