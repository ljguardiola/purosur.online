import { describe, expect, it } from "vitest";
import { argentinaInstant } from "../../shared/index.js";
import type { ReturnDraftLine } from "../model/return-draft.js";
import { previewReturn } from "./preview-return.js";
import { FakeReturnLedger, type FakeReturnLedgerState } from "./test-support/fake-return-ledger.js";
import { FixedClock } from "./test-support/fixed-clock.js";
import { aSaleForReturn, RETURNED_AT } from "./test-support/sale-for-return.js";

function preview(
  lines: ReturnDraftLine[],
  state: Partial<FakeReturnLedgerState> = {},
  now: Date = RETURNED_AT,
  saleId = "sale-1",
) {
  const ledger = new FakeReturnLedger({ sales: [aSaleForReturn()], ...state });
  return previewReturn({ reader: ledger, clock: new FixedClock(now) }, { saleId, lines });
}

const YERBA: ReturnDraftLine = {
  saleLineId: "line-1",
  quantity: 2,
  reason: "change_of_mind",
  disposition: "restock",
};
const CHEESE: ReturnDraftLine = {
  saleLineId: "line-3",
  quantity: 250,
  reason: "defective",
  disposition: null,
};

describe("previewReturn", () => {
  it("tells what each line would refund and the total, so the cashier can choose the payments", () => {
    expect(preview([YERBA, { ...CHEESE, disposition: "discard" }])).toEqual({
      kind: "previewed",
      lines: [
        { ...YERBA, refusal: null, refundAmount: 5000 },
        { ...CHEESE, disposition: "discard", refusal: null, refundAmount: 2000 },
      ],
      refundableTotal: 7000,
    });
  });

  it("tells which line is refused and why while the others still count, leaving the missing disposition for the cashier to choose", () => {
    expect(preview([YERBA, CHEESE])).toEqual({
      kind: "previewed",
      lines: [
        { ...YERBA, refusal: null, refundAmount: 5000 },
        { ...CHEESE, refusal: { kind: "missing_disposition" }, refundAmount: null },
      ],
      refundableTotal: 5000,
    });
  });

  it("tells the window has passed with the last day it was allowed", () => {
    const outcome = preview([YERBA], {}, new Date(argentinaInstant("2026-09-28", "09:00")));

    expect(outcome).toMatchObject({
      lines: [
        {
          refusal: {
            kind: "outside_window",
            reason: "change_of_mind",
            lastAllowedDay: "2026-09-27",
          },
        },
      ],
      refundableTotal: 0,
    });
  });

  it("follows the days the branch allows for a change of mind", () => {
    const outcome = preview(
      [YERBA],
      { goodConditionReturnDays: 30 },
      new Date(argentinaInstant("2026-09-28", "09:00")),
    );

    expect(outcome).toMatchObject({ lines: [{ refusal: null }] });
  });

  it("previews a draft with no lines as refunding nothing", () => {
    expect(preview([])).toEqual({ kind: "previewed", lines: [], refundableTotal: 0 });
  });

  it("takes what earlier returns already took back into account", () => {
    const earlier = aSaleForReturn({
      returned: [{ saleLineId: "line-1", quantity: 2, refundedAmount: 5000 }],
    });

    expect(preview([YERBA], { sales: [earlier] })).toMatchObject({
      lines: [{ refusal: { kind: "quantity_exceeds_returnable", returnable: 1 } }],
    });
  });

  it("answers not found for a sale the register does not have", () => {
    expect(preview([YERBA], {}, RETURNED_AT, "sale-9")).toEqual({ kind: "not_found" });
  });

  it.each(["OPEN", "VOIDED", "CANCELLED"] as const)(
    "answers that a %s sale cannot be returned",
    (state) => {
      const sale = aSaleForReturn();
      sale.sale.state = state;

      expect(preview([YERBA], { sales: [sale] })).toEqual({ kind: "sale_not_returnable" });
    },
  );

  it("changes nothing in the register", () => {
    const ledger = new FakeReturnLedger({ sales: [aSaleForReturn()] });
    const before = structuredClone(ledger.state);

    previewReturn(
      { reader: ledger, clock: new FixedClock(RETURNED_AT) },
      { saleId: "sale-1", lines: [YERBA] },
    );

    expect(ledger.state).toEqual(before);
  });
});
