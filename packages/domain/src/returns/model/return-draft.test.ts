import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { argentinaInstant } from "../../shared/index.js";
import {
  assessReturnDraft,
  firstLineRefusal,
  type ReturnDraftLine,
  type ReturnSaleContext,
  type ReturnSaleLine,
  refundableTotal,
} from "./return-draft.js";

const SOLD_AT = new Date(argentinaInstant("2026-09-12", "15:30"));
const WITHIN_WINDOW = new Date(argentinaInstant("2026-09-20", "10:00"));
const PAST_CHANGE_OF_MIND = new Date(argentinaInstant("2026-09-28", "10:00"));
const PAST_DEFECT = new Date(argentinaInstant("2027-03-13", "10:00"));

const YERBA: ReturnSaleLine = {
  id: "line-1",
  soldQuantity: 3,
  promotionId: null,
  chargedAmount: 7500,
  returnedQuantity: 0,
  refundedAmount: 0,
};
const PROMOTED: ReturnSaleLine = {
  id: "line-2",
  soldQuantity: 4,
  promotionId: "two-for-one",
  chargedAmount: 4000,
  returnedQuantity: 0,
  refundedAmount: 0,
};
const CHEESE: ReturnSaleLine = {
  id: "line-3",
  soldQuantity: 1250,
  promotionId: null,
  chargedAmount: 10_000,
  returnedQuantity: 250,
  refundedAmount: 2000,
};

function sale(now: Date, lines: ReturnSaleLine[] = [YERBA, PROMOTED, CHEESE]): ReturnSaleContext {
  return { soldAt: SOLD_AT, goodConditionReturnDays: 15, now, lines };
}

function draftLine(overrides: Partial<ReturnDraftLine> = {}): ReturnDraftLine {
  return {
    saleLineId: "line-1",
    quantity: 1,
    reason: "change_of_mind",
    disposition: "restock",
    ...overrides,
  };
}

function refusalOf(
  context: ReturnSaleContext,
  line: ReturnDraftLine,
): ReturnType<typeof firstLineRefusal> {
  return firstLineRefusal(assessReturnDraft(context, [line]));
}

describe("assessReturnDraft", () => {
  it("prices each returned line at its share of what it charged", () => {
    expect(
      assessReturnDraft(sale(WITHIN_WINDOW), [
        draftLine({ quantity: 1 }),
        draftLine({
          saleLineId: "line-3",
          quantity: 250,
          reason: "defective",
          disposition: "discard",
        }),
      ]),
    ).toEqual([
      {
        saleLineId: "line-1",
        quantity: 1,
        reason: "change_of_mind",
        disposition: "restock",
        refusal: null,
        refundAmount: 2500,
      },
      {
        saleLineId: "line-3",
        quantity: 250,
        reason: "defective",
        disposition: "discard",
        refusal: null,
        refundAmount: 2000,
      },
    ]);
  });

  it("assesses every line, so each one's own refusal shows", () => {
    const assessed = assessReturnDraft(sale(WITHIN_WINDOW), [
      draftLine({ quantity: 9 }),
      draftLine({ saleLineId: "line-3", quantity: 250, disposition: null }),
    ]);

    expect(assessed.map(({ refusal }) => refusal?.kind ?? null)).toEqual([
      "quantity_exceeds_returnable",
      "missing_disposition",
    ]);
    expect(assessed.map(({ refundAmount }) => refundAmount)).toEqual([null, null]);
  });

  it("keeps what the cashier chose even when the line is refused", () => {
    expect(
      assessReturnDraft(sale(WITHIN_WINDOW), [draftLine({ quantity: 9, reason: null })])[0],
    ).toMatchObject({ saleLineId: "line-1", quantity: 9, reason: null, disposition: "restock" });
  });

  it("refuses a line the sale does not have", () => {
    expect(refusalOf(sale(WITHIN_WINDOW), draftLine({ saleLineId: "line-9" }))).toEqual({
      saleLineId: "line-9",
      refusal: { kind: "unknown_line" },
    });
  });

  it("refuses a line that appears twice, from its second appearance", () => {
    const assessed = assessReturnDraft(sale(WITHIN_WINDOW), [
      draftLine(),
      draftLine({ quantity: 2 }),
    ]);

    expect(assessed.map(({ refusal }) => refusal)).toEqual([null, { kind: "duplicate_line" }]);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 60])(
    "refuses a quantity of %s",
    (quantity) => {
      expect(refusalOf(sale(WITHIN_WINDOW), draftLine({ quantity }))).toEqual({
        saleLineId: "line-1",
        refusal: { kind: "invalid_quantity" },
      });
    },
  );

  it("refuses a line without a reason", () => {
    expect(refusalOf(sale(WITHIN_WINDOW), draftLine({ reason: null }))).toEqual({
      saleLineId: "line-1",
      refusal: { kind: "missing_reason" },
    });
  });

  it("refuses a line without a disposition, with no default", () => {
    expect(refusalOf(sale(WITHIN_WINDOW), draftLine({ disposition: null }))).toEqual({
      saleLineId: "line-1",
      refusal: { kind: "missing_disposition" },
    });
  });

  it("refuses more than the line sold minus what was already returned, saying how much can still come back", () => {
    expect(refusalOf(sale(WITHIN_WINDOW), draftLine({ quantity: 4 }))).toEqual({
      saleLineId: "line-1",
      refusal: { kind: "quantity_exceeds_returnable", returnable: 3 },
    });
    expect(
      refusalOf(sale(WITHIN_WINDOW), draftLine({ saleLineId: "line-3", quantity: 1001 })),
    ).toEqual({
      saleLineId: "line-3",
      refusal: { kind: "quantity_exceeds_returnable", returnable: 1000 },
    });
  });

  it("accepts exactly what can still come back", () => {
    expect(
      refusalOf(sale(WITHIN_WINDOW), draftLine({ saleLineId: "line-3", quantity: 1000 })),
    ).toBeNull();
  });

  it("refuses anything from a line that has nothing left to return", () => {
    const spent = { ...YERBA, returnedQuantity: 3, refundedAmount: 7500 };

    expect(refusalOf(sale(WITHIN_WINDOW, [spent]), draftLine({ quantity: 1 }))).toEqual({
      saleLineId: "line-1",
      refusal: { kind: "quantity_exceeds_returnable", returnable: 0 },
    });
  });

  it("returns a promotion line only whole, saying how much that is", () => {
    expect(
      refusalOf(sale(WITHIN_WINDOW), draftLine({ saleLineId: "line-2", quantity: 3 })),
    ).toEqual({
      saleLineId: "line-2",
      refusal: { kind: "promotion_whole_only", returnable: 4 },
    });
  });

  it("refunds a promotion line whole as its share of what was charged, never its list price", () => {
    expect(
      assessReturnDraft(sale(WITHIN_WINDOW), [draftLine({ saleLineId: "line-2", quantity: 4 })])[0],
    ).toMatchObject({ refusal: null, refundAmount: 4000 });
  });

  it("returns what is left of a promotion line whole after an earlier return took its remaining part", () => {
    const partlyReturned = { ...PROMOTED, returnedQuantity: 1, refundedAmount: 1000 };

    expect(
      assessReturnDraft(sale(WITHIN_WINDOW, [partlyReturned]), [
        draftLine({ saleLineId: "line-2", quantity: 3 }),
      ])[0],
    ).toMatchObject({ refusal: null, refundAmount: 3000 });
  });

  it("refuses a change of mind after the branch's days, saying the last day it was allowed", () => {
    expect(refusalOf(sale(PAST_CHANGE_OF_MIND), draftLine())).toEqual({
      saleLineId: "line-1",
      refusal: { kind: "outside_window", reason: "change_of_mind", lastAllowedDay: "2026-09-27" },
    });
  });

  it("still accepts that same line as defective", () => {
    expect(refusalOf(sale(PAST_CHANGE_OF_MIND), draftLine({ reason: "defective" }))).toBeNull();
  });

  it("refuses a defect after six months, saying the last day it was allowed", () => {
    expect(refusalOf(sale(PAST_DEFECT), draftLine({ reason: "defective" }))).toEqual({
      saleLineId: "line-1",
      refusal: { kind: "outside_window", reason: "defective", lastAllowedDay: "2027-03-12" },
    });
  });

  it("follows the branch's days for a change of mind", () => {
    expect(
      refusalOf({ ...sale(PAST_CHANGE_OF_MIND), goodConditionReturnDays: 30 }, draftLine()),
    ).toBeNull();
  });

  it("answers a missing reason before a missing disposition, and both before the quantity", () => {
    expect(
      refusalOf(sale(WITHIN_WINDOW), draftLine({ reason: null, disposition: null, quantity: 99 }))
        ?.refusal,
    ).toEqual({ kind: "missing_reason" });
    expect(
      refusalOf(sale(WITHIN_WINDOW), draftLine({ disposition: null, quantity: 99 }))?.refusal,
    ).toEqual({ kind: "missing_disposition" });
  });

  it("answers an invalid quantity before a missing reason", () => {
    expect(
      refusalOf(sale(WITHIN_WINDOW), draftLine({ quantity: 0, reason: null }))?.refusal,
    ).toEqual({
      kind: "invalid_quantity",
    });
  });

  it("answers a quantity above what is left before the promotion rule, and that before the window", () => {
    expect(
      refusalOf(sale(PAST_CHANGE_OF_MIND), draftLine({ saleLineId: "line-2", quantity: 5 }))
        ?.refusal,
    ).toEqual({ kind: "quantity_exceeds_returnable", returnable: 4 });
    expect(
      refusalOf(sale(PAST_CHANGE_OF_MIND), draftLine({ saleLineId: "line-2", quantity: 3 }))
        ?.refusal,
    ).toEqual({ kind: "promotion_whole_only", returnable: 4 });
  });

  it("assesses nothing for a draft with no lines", () => {
    expect(assessReturnDraft(sale(WITHIN_WINDOW), [])).toEqual([]);
  });
});

describe("firstLineRefusal", () => {
  it("is nothing when every line is accepted", () => {
    expect(firstLineRefusal(assessReturnDraft(sale(WITHIN_WINDOW), [draftLine()]))).toBeNull();
  });

  it("names the first refused line in the order the cashier entered them", () => {
    expect(
      firstLineRefusal(
        assessReturnDraft(sale(WITHIN_WINDOW), [
          draftLine(),
          draftLine({ saleLineId: "line-3", disposition: null }),
          draftLine({ saleLineId: "line-9" }),
        ]),
      ),
    ).toEqual({ saleLineId: "line-3", refusal: { kind: "missing_disposition" } });
  });
});

describe("refundableTotal", () => {
  it("adds up what the accepted lines refund and leaves out the refused ones", () => {
    expect(
      refundableTotal(
        assessReturnDraft(sale(WITHIN_WINDOW), [
          draftLine({ quantity: 2 }),
          draftLine({ saleLineId: "line-3", quantity: 250 }),
          draftLine({ saleLineId: "line-9" }),
        ]),
      ),
    ).toBe(5000 + 2000);
  });

  it("is nothing for no lines", () => {
    expect(refundableTotal([])).toBe(0);
  });

  it("never exceeds what the lines charged, however the draft is split", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 200 }),
        fc.integer({ min: 0, max: 5_000_000 }),
        fc.integer({ min: 1, max: 200 }),
        (soldQuantity, chargedAmount, quantity) => {
          const line = { ...YERBA, soldQuantity, chargedAmount };
          const assessed = assessReturnDraft(sale(WITHIN_WINDOW, [line]), [
            draftLine({ quantity }),
          ]);

          expect(refundableTotal(assessed)).toBeLessThanOrEqual(chargedAmount);
          expect(refundableTotal(assessed)).toBeGreaterThanOrEqual(0);
        },
      ),
    );
  });
});
