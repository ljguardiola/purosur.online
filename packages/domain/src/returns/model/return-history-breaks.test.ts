import { describe, expect, it } from "vitest";
import { argentinaInstant } from "../../shared/index.js";
import {
  type ReturnAgainstHistory,
  returnHistoryBreaks,
  type SaleReturnHistory,
} from "./return-history-breaks.js";

const HISTORY: SaleReturnHistory = {
  saleOccurredAt: new Date(argentinaInstant("2026-09-12", "15:30")),
  goodConditionReturnDays: 15,
  lines: [
    { saleLineId: "line-1", soldQuantity: 3, returnedQuantity: 1 },
    { saleLineId: "line-2", soldQuantity: 1250, returnedQuantity: 0 },
  ],
  payments: [
    { paymentId: "pay-1", amount: 5000, refundedAmount: 1000 },
    { paymentId: "pay-2", amount: 2000, refundedAmount: 0 },
  ],
};

function returned(overrides: Partial<ReturnAgainstHistory> = {}): ReturnAgainstHistory {
  return {
    occurredAt: new Date(argentinaInstant("2026-09-20", "10:00")),
    lines: [{ saleLineId: "line-1", quantity: 2, reason: "change_of_mind" }],
    refunds: [{ paymentId: "pay-1", amount: 4000 }],
    ...overrides,
  };
}

describe("returnHistoryBreaks", () => {
  it("finds nothing wrong with a return that fits what the sale's history left", () => {
    expect(returnHistoryBreaks(returned(), HISTORY)).toEqual([]);
  });

  it("accepts a return that takes exactly what is left of a line and of a payment, on a window's last day", () => {
    expect(
      returnHistoryBreaks(
        returned({
          occurredAt: new Date(argentinaInstant("2026-09-27", "23:00")),
          refunds: [{ paymentId: "pay-1", amount: 4000 }],
        }),
        HISTORY,
      ),
    ).toEqual([]);
  });

  describe("a refund beyond what the payment still had to give back", () => {
    it("is flagged", () => {
      expect(
        returnHistoryBreaks(returned({ refunds: [{ paymentId: "pay-1", amount: 4001 }] }), HISTORY),
      ).toEqual(["return_refund_exceeds_payment"]);
    });

    it("counts what several refunds of the return take out of the same payment", () => {
      expect(
        returnHistoryBreaks(
          returned({
            refunds: [
              { paymentId: "pay-1", amount: 2500 },
              { paymentId: "pay-1", amount: 1501 },
            ],
          }),
          HISTORY,
        ),
      ).toEqual(["return_refund_exceeds_payment"]);
    });

    it("is flagged for a payment the sale's history does not have", () => {
      expect(
        returnHistoryBreaks(returned({ refunds: [{ paymentId: "pay-9", amount: 1 }] }), HISTORY),
      ).toEqual(["return_refund_exceeds_payment"]);
    });
  });

  describe("a line completed outside its window", () => {
    it("is flagged for a change of mind after the branch's days", () => {
      expect(
        returnHistoryBreaks(
          returned({ occurredAt: new Date(argentinaInstant("2026-09-28", "00:00")) }),
          HISTORY,
        ),
      ).toEqual(["return_line_outside_window"]);
    });

    it("accepts the same day as a defect, until six months have passed", () => {
      const defective = { saleLineId: "line-1", quantity: 2, reason: "defective" as const };

      expect(
        returnHistoryBreaks(
          returned({
            lines: [defective],
            occurredAt: new Date(argentinaInstant("2027-03-12", "12:00")),
          }),
          HISTORY,
        ),
      ).toEqual([]);
      expect(
        returnHistoryBreaks(
          returned({
            lines: [defective],
            occurredAt: new Date(argentinaInstant("2027-03-13", "00:00")),
          }),
          HISTORY,
        ),
      ).toEqual(["return_line_outside_window"]);
    });

    it("follows the branch's days of the history", () => {
      expect(
        returnHistoryBreaks(
          returned({ occurredAt: new Date(argentinaInstant("2026-09-28", "00:00")) }),
          { ...HISTORY, goodConditionReturnDays: 16 },
        ),
      ).toEqual([]);
    });
  });

  describe("a quantity beyond what the sale's lines had left", () => {
    it("is flagged", () => {
      expect(
        returnHistoryBreaks(
          returned({ lines: [{ saleLineId: "line-1", quantity: 3, reason: "change_of_mind" }] }),
          HISTORY,
        ),
      ).toEqual(["return_quantity_exceeds_sale"]);
    });

    it("is flagged for a line the sale's history does not have", () => {
      expect(
        returnHistoryBreaks(
          returned({ lines: [{ saleLineId: "line-9", quantity: 1, reason: "change_of_mind" }] }),
          HISTORY,
        ),
      ).toEqual(["return_quantity_exceeds_sale"]);
    });
  });

  it("flags a break of any one refund, line or quantity, not only when all of them break", () => {
    const occurredAt = new Date(argentinaInstant("2026-09-28", "10:00"));

    expect(
      returnHistoryBreaks(
        returned({
          refunds: [
            { paymentId: "pay-1", amount: 100 },
            { paymentId: "pay-2", amount: 2001 },
          ],
        }),
        HISTORY,
      ),
    ).toEqual(["return_refund_exceeds_payment"]);
    expect(
      returnHistoryBreaks(
        returned({
          occurredAt,
          lines: [
            { saleLineId: "line-1", quantity: 1, reason: "defective" },
            { saleLineId: "line-2", quantity: 1, reason: "change_of_mind" },
          ],
        }),
        HISTORY,
      ),
    ).toEqual(["return_line_outside_window"]);
    expect(
      returnHistoryBreaks(
        returned({
          lines: [
            { saleLineId: "line-2", quantity: 1, reason: "change_of_mind" },
            { saleLineId: "line-1", quantity: 3, reason: "change_of_mind" },
          ],
        }),
        HISTORY,
      ),
    ).toEqual(["return_quantity_exceeds_sale"]);
  });

  it("flags every break a return has, refunds first, then the window, then the quantities", () => {
    expect(
      returnHistoryBreaks(
        {
          occurredAt: new Date(argentinaInstant("2026-10-30", "10:00")),
          lines: [{ saleLineId: "line-1", quantity: 9, reason: "change_of_mind" }],
          refunds: [{ paymentId: "pay-2", amount: 2001 }],
        },
        HISTORY,
      ),
    ).toEqual([
      "return_refund_exceeds_payment",
      "return_line_outside_window",
      "return_quantity_exceeds_sale",
    ]);
  });

  it("flags each break once, however many lines or refunds commit it", () => {
    expect(
      returnHistoryBreaks(
        returned({
          lines: [
            { saleLineId: "line-1", quantity: 9, reason: "change_of_mind" },
            { saleLineId: "line-2", quantity: 9999, reason: "change_of_mind" },
          ],
          refunds: [
            { paymentId: "pay-1", amount: 9999 },
            { paymentId: "pay-2", amount: 9999 },
          ],
        }),
        HISTORY,
      ),
    ).toEqual(["return_refund_exceeds_payment", "return_quantity_exceeds_sale"]);
  });
});
