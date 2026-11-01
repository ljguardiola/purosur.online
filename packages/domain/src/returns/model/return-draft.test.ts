import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { argentinaInstant, FIXED_ARGENTINA_ZONE_RULES } from "../../shared/index.js";
import {
  acceptedLines,
  assessReturnDraft,
  firstLineRefusal,
  type ReturnDraftLine,
  type ReturnSaleContext,
  type ReturnSaleLine,
  refundableTotal,
} from "./return-draft.js";

const SOLD_AT = new Date(argentinaInstant("2026-09-12", "15:30", FIXED_ARGENTINA_ZONE_RULES));
const WITHIN_WINDOW = new Date(argentinaInstant("2026-09-20", "10:00", FIXED_ARGENTINA_ZONE_RULES));
const PAST_CHANGE_OF_MIND = new Date(
  argentinaInstant("2026-09-28", "10:00", FIXED_ARGENTINA_ZONE_RULES),
);
const PAST_DEFECT = new Date(argentinaInstant("2027-03-13", "10:00", FIXED_ARGENTINA_ZONE_RULES));

const YERBA: ReturnSaleLine = {
  id: "line-1",
  soldQuantity: 3,
  promotionId: null,
  promotionKind: null,
  chargedAmount: 7500,
  returnedQuantity: 0,
  refundedAmount: 0,
};
const PROMOTED: ReturnSaleLine = {
  id: "line-2",
  soldQuantity: 4,
  promotionId: "two-for-one",
  promotionKind: "BUY_N_PAY_M",
  chargedAmount: 4000,
  returnedQuantity: 0,
  refundedAmount: 0,
};
const CHEESE: ReturnSaleLine = {
  id: "line-3",
  soldQuantity: 1250,
  promotionId: null,
  promotionKind: null,
  chargedAmount: 10_000,
  returnedQuantity: 250,
  refundedAmount: 2000,
};

function sale(now: Date, lines: ReturnSaleLine[] = [YERBA, PROMOTED, CHEESE]): ReturnSaleContext {
  return {
    soldAt: SOLD_AT,
    goodConditionReturnDays: 15,
    now,
    rules: FIXED_ARGENTINA_ZONE_RULES,
    lines,
  };
}

function draftLine(overrides: Partial<ReturnDraftLine> = {}): ReturnDraftLine {
  return {
    saleLineId: "line-1",
    quantity: 1,
    reason: "change_of_mind",
    disposition: "restock",
    resolution: null,
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
          resolution: "refund",
        }),
      ]),
    ).toEqual([
      {
        saleLineId: "line-1",
        quantity: 1,
        reason: "change_of_mind",
        disposition: "restock",
        resolution: "refund",
        refusal: null,
        refundAmount: 2500,
      },
      {
        saleLineId: "line-3",
        quantity: 250,
        reason: "defective",
        disposition: "discard",
        resolution: "refund",
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

  it("returns a buy-N-pay-M line only whole for a change of mind, saying how much that is", () => {
    expect(
      refusalOf(sale(WITHIN_WINDOW), draftLine({ saleLineId: "line-2", quantity: 3 })),
    ).toEqual({
      saleLineId: "line-2",
      refusal: { kind: "promotion_whole_only", returnable: 4 },
    });
  });

  it("accepts part of a buy-N-pay-M line when the reason is a defect, refunding its share of what was charged", () => {
    expect(
      assessReturnDraft(sale(WITHIN_WINDOW), [
        draftLine({ saleLineId: "line-2", quantity: 3, reason: "defective" }),
      ])[0],
    ).toMatchObject({ refusal: null, refundAmount: 3000 });
  });

  it("accepts part of a percentage-off line for any reason", () => {
    const discounted = { ...PROMOTED, promotionId: "ten", promotionKind: "PERCENT_OFF" } as const;

    expect(
      refusalOf(
        sale(WITHIN_WINDOW, [discounted]),
        draftLine({ saleLineId: "line-2", quantity: 1, reason: "change_of_mind" }),
      ),
    ).toBeNull();
  });

  it("returns a promotion line whose kind is unknown only whole for a change of mind", () => {
    const unknown = { ...PROMOTED, promotionKind: null };

    expect(
      refusalOf(
        sale(WITHIN_WINDOW, [unknown]),
        draftLine({ saleLineId: "line-2", quantity: 1, reason: "change_of_mind" }),
      ),
    ).toEqual({
      saleLineId: "line-2",
      refusal: { kind: "promotion_whole_only", returnable: 4 },
    });
  });

  it("accepts part of a promotion line whose kind is unknown when the reason is a defect, refunding its share of what was charged", () => {
    const unknown = { ...PROMOTED, promotionKind: null };

    expect(
      assessReturnDraft(sale(WITHIN_WINDOW, [unknown]), [
        draftLine({ saleLineId: "line-2", quantity: 3, reason: "defective" }),
      ])[0],
    ).toMatchObject({ refusal: null, refundAmount: 3000 });
  });

  it("refunds a buy-3-pay-2 line that charged $200 one third of that for the first unit, then only the difference for the next", () => {
    const threeForTwo: ReturnSaleLine = {
      ...PROMOTED,
      soldQuantity: 3,
      chargedAmount: 20_000,
    };
    const defective = draftLine({ saleLineId: "line-2", quantity: 1, reason: "defective" });

    expect(assessReturnDraft(sale(WITHIN_WINDOW, [threeForTwo]), [defective])[0]).toMatchObject({
      refusal: null,
      refundAmount: 6667,
    });
    expect(
      assessReturnDraft(
        sale(WITHIN_WINDOW, [{ ...threeForTwo, returnedQuantity: 1, refundedAmount: 6667 }]),
        [defective],
      )[0],
    ).toMatchObject({ refusal: null, refundAmount: 6666 });
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

  it("answers a missing disposition before a missing resolution, and both before the quantity", () => {
    expect(
      refusalOf(
        sale(WITHIN_WINDOW),
        draftLine({ reason: "defective", disposition: null, resolution: null, quantity: 99 }),
      )?.refusal,
    ).toEqual({ kind: "missing_disposition" });
    expect(
      refusalOf(
        sale(WITHIN_WINDOW),
        draftLine({ reason: "defective", resolution: null, quantity: 99 }),
      )?.refusal,
    ).toEqual({ kind: "missing_resolution" });
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

describe("assessReturnDraft resolution", () => {
  const defective = (overrides: Partial<ReturnDraftLine> = {}) =>
    draftLine({ reason: "defective", ...overrides });

  it("refuses a defective line until the cashier chooses to refund or exchange it, with no default", () => {
    expect(refusalOf(sale(WITHIN_WINDOW), defective())).toEqual({
      saleLineId: "line-1",
      refusal: { kind: "missing_resolution" },
    });
  });

  it("refunds a defective line the cashier chose to refund, at its share of what it charged", () => {
    expect(assessReturnDraft(sale(WITHIN_WINDOW), [defective({ resolution: "refund" })])).toEqual([
      {
        saleLineId: "line-1",
        quantity: 1,
        reason: "defective",
        disposition: "restock",
        resolution: "refund",
        refusal: null,
        refundAmount: 2500,
      },
    ]);
  });

  it("accepts a defective line the cashier chose to exchange and refunds nothing for it", () => {
    expect(assessReturnDraft(sale(WITHIN_WINDOW), [defective({ resolution: "exchange" })])).toEqual(
      [
        {
          saleLineId: "line-1",
          quantity: 1,
          reason: "defective",
          disposition: "restock",
          resolution: "exchange",
          refusal: null,
          refundAmount: 0,
        },
      ],
    );
  });

  it("always refunds a change of mind, whether or not the cashier chose", () => {
    expect(
      assessReturnDraft(sale(WITHIN_WINDOW), [draftLine({ resolution: null })])[0],
    ).toMatchObject({ refusal: null, resolution: "refund", refundAmount: 2500 });
    expect(
      assessReturnDraft(sale(WITHIN_WINDOW), [draftLine({ resolution: "refund" })])[0],
    ).toMatchObject({ refusal: null, resolution: "refund" });
  });

  it("refuses to exchange a change of mind", () => {
    expect(refusalOf(sale(WITHIN_WINDOW), draftLine({ resolution: "exchange" }))).toEqual({
      saleLineId: "line-1",
      refusal: { kind: "resolution_not_offered" },
    });
  });

  it("answers a resolution that is not offered before the quantity", () => {
    expect(
      refusalOf(sale(WITHIN_WINDOW), draftLine({ resolution: "exchange", quantity: 99 }))?.refusal,
    ).toEqual({ kind: "resolution_not_offered" });
  });

  it("exchanges part of a buy-N-pay-M line without changing what the line has returned", () => {
    const [assessed] = assessReturnDraft(sale(WITHIN_WINDOW), [
      defective({ saleLineId: "line-2", quantity: 1, resolution: "exchange" }),
    ]);

    expect(assessed).toMatchObject({ refusal: null, refundAmount: 0 });
  });

  it("still keeps an exchanged quantity within what the line has left", () => {
    expect(
      refusalOf(
        sale(WITHIN_WINDOW),
        defective({ saleLineId: "line-3", quantity: 1001, resolution: "exchange" }),
      )?.refusal,
    ).toEqual({ kind: "quantity_exceeds_returnable", returnable: 1000 });
  });

  it("keeps an exchange out of the refundable total", () => {
    expect(
      refundableTotal(
        assessReturnDraft(sale(WITHIN_WINDOW), [
          defective({ quantity: 2, resolution: "exchange" }),
          draftLine({ saleLineId: "line-3", quantity: 250 }),
        ]),
      ),
    ).toBe(2000);
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

describe("acceptedLines", () => {
  it("keeps the lines that were accepted, with the reason and disposition the cashier chose", () => {
    expect(
      acceptedLines(
        assessReturnDraft(sale(WITHIN_WINDOW), [
          draftLine({ quantity: 2 }),
          draftLine({ saleLineId: "line-3", disposition: null }),
        ]),
      ),
    ).toEqual([
      {
        saleLineId: "line-1",
        quantity: 2,
        reason: "change_of_mind",
        disposition: "restock",
        resolution: "refund",
        refusal: null,
        refundAmount: 5000,
      },
    ]);
  });

  it("is nothing when every line was refused", () => {
    expect(
      acceptedLines(assessReturnDraft(sale(WITHIN_WINDOW), [draftLine({ quantity: 9 })])),
    ).toEqual([]);
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
